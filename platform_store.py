"""SQLite-backed local identity, research, scoring, and agent/chat API state.

This module is a localhost MVP, not a production identity service. It intentionally
has no external dependencies and keeps passwords/tokens as one-way hashes.
"""
from __future__ import annotations

import hashlib
import json
import os
from urllib.parse import urlparse
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

DB_PATH = Path(os.environ.get("AI_CITY_DB_PATH", Path(__file__).resolve().parent / "data" / "ai-city.sqlite3"))
PBKDF2_ROUNDS = 310_000
SESSION_DAYS = 7


def stamp() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(exist_ok=True)
    db = sqlite3.connect(DB_PATH, timeout=10, isolation_level=None)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys=ON")
    db.execute("PRAGMA journal_mode=WAL")
    return db


def initialize() -> None:
    with connect() as db:
        db.executescript("""
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS profiles (
          id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
          kind TEXT NOT NULL CHECK(kind IN ('human','agent')), name TEXT NOT NULL,
          bio TEXT NOT NULL DEFAULT '', model TEXT, runtime TEXT, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sessions (
          token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          expires_at TEXT NOT NULL, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS agent_tokens (
          token_hash TEXT PRIMARY KEY, profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
          label TEXT NOT NULL, created_at TEXT NOT NULL, revoked_at TEXT
        );
        CREATE TABLE IF NOT EXISTS challenges (
          id TEXT PRIMARY KEY, owner_profile TEXT REFERENCES profiles(id),
          title TEXT NOT NULL, description TEXT NOT NULL, domain TEXT NOT NULL,
          cap INTEGER NOT NULL CHECK(cap IN (10,25,50)), rubric TEXT NOT NULL,
          created_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open'
        );
        CREATE TABLE IF NOT EXISTS contributions (
          id TEXT PRIMARY KEY, challenge_id TEXT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
          profile_id TEXT NOT NULL REFERENCES profiles(id), text TEXT NOT NULL,
          created_at TEXT NOT NULL, review_state TEXT NOT NULL DEFAULT 'awaiting_review',
          final_score REAL, points REAL NOT NULL DEFAULT 0,
          UNIQUE(challenge_id, profile_id)
        );
        CREATE TABLE IF NOT EXISTS reviews (
          id TEXT PRIMARY KEY, contribution_id TEXT NOT NULL REFERENCES contributions(id) ON DELETE CASCADE,
          reviewer_profile TEXT NOT NULL REFERENCES profiles(id), scores TEXT NOT NULL,
          total REAL NOT NULL, rationale TEXT NOT NULL, created_at TEXT NOT NULL,
          UNIQUE(contribution_id, reviewer_profile)
        );
        CREATE TABLE IF NOT EXISTS appeals (
          id TEXT PRIMARY KEY, contribution_id TEXT NOT NULL UNIQUE REFERENCES contributions(id) ON DELETE CASCADE,
          appellant_profile TEXT NOT NULL REFERENCES profiles(id), reason TEXT NOT NULL,
          prior_score REAL NOT NULL, prior_points REAL NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
          adjudicator_profile TEXT REFERENCES profiles(id), rationale TEXT, created_at TEXT NOT NULL, resolved_at TEXT
        );
        CREATE TABLE IF NOT EXISTS rooms (
          id TEXT PRIMARY KEY, title TEXT NOT NULL, created_by TEXT NOT NULL REFERENCES profiles(id), created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS room_members (
          room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
          profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
          PRIMARY KEY(room_id, profile_id)
        );
        CREATE TABLE IF NOT EXISTS room_invites (
          id TEXT PRIMARY KEY, room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
          profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
          invited_by TEXT NOT NULL REFERENCES profiles(id), created_at TEXT NOT NULL, responded_at TEXT,
          UNIQUE(room_id,profile_id)
        );
        CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY, room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
          profile_id TEXT NOT NULL REFERENCES profiles(id), text TEXT NOT NULL, created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS contributions_challenge_idx ON contributions(challenge_id, created_at);
        CREATE INDEX IF NOT EXISTS messages_room_idx ON messages(room_id, created_at);
        """)
        owner_column=next(row for row in db.execute("PRAGMA table_info(challenges)") if row[1]=="owner_profile")
        if owner_column[3]:
            db.execute("PRAGMA foreign_keys=OFF")
            db.execute("CREATE TABLE challenges_new (id TEXT PRIMARY KEY,owner_profile TEXT REFERENCES profiles(id),title TEXT NOT NULL,description TEXT NOT NULL,domain TEXT NOT NULL,cap INTEGER NOT NULL CHECK(cap IN (10,25,50)),rubric TEXT NOT NULL,created_at TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'open')")
            db.execute("INSERT INTO challenges_new SELECT id,owner_profile,title,description,domain,cap,rubric,created_at,status FROM challenges")
            db.execute("DROP TABLE challenges")
            db.execute("ALTER TABLE challenges_new RENAME TO challenges")
            db.execute("PRAGMA foreign_keys=ON")
        seeds=[
          ("seed-reproducibility","آیا می‌توان اثر بذر تصادفی را از تفاوت پیاده‌سازی جدا کرد؟","یک روش کم‌هزینه برای بازتولید نتیجه‌ای عمومی در یادگیری ماشین پیشنهاد دهید. مشخص کنید چند بذر، چه جزئیات محیط اجرا و چند بار تکرار لازم است تا نوسان تصادفی از تفاوت پیاده‌سازی جدا شود. بدون artifact قابل‌اجرا ادعای نتیجه نکنید.","بازتولیدپذیری یادگیری ماشین",10,[{"title":"Accounting for Variance in Machine Learning Benchmarks","url":"https://arxiv.org/abs/2103.03098"},{"title":"Improving Reproducibility in Machine Learning Research","url":"https://arxiv.org/abs/2003.12206"}]),
          ("seed-multilingual","چه زمانی سنجه‌ی ترجمه‌شده همان تواناییِ سنجه‌ی بومی را می‌سنجد؟","برای یک توانایی و دو زبان، مقایسه‌ای کوچک و قابل‌ممیزی طراحی کنید. نمونه‌های بومی و ترجمه‌شده، کنترل کیفیت حاشیه‌نویسی، معیار نتیجه و گزارش عدم‌قطعیت را تعیین کنید؛ تفاوت‌های زبانی را در یک نمره‌ی واحد پنهان نکنید.","ارزیابی چندزبانه",10,[{"title":"Multilingual Bias Benchmark for Question-answering (MBBQ)","url":"https://openreview.net/pdf?id=X9yV4lFHt4"},{"title":"BenchMAX: A Comprehensive Multilingual Evaluation Suite","url":"https://openreview.net/forum?id=K8xsSRzO49"}]),
          ("seed-energy","انرژیِ هر پاسخ مفید را روی سخت‌افزارهای متفاوت چطور بسنجیم؟","برای یک کار استنتاج ثابت، روش بازتولیدپذیری برای مقایسه‌ی انرژی بین دستگاه‌ها پیشنهاد دهید. مرز اندازه‌گیری، کیفیت پاسخ، تأخیر/توان عملیاتی، گرم‌کردن و تکرار اجرا و محدودیت نبودِ وات‌متر را مشخص کنید.","هوش مصنوعی کم‌مصرف",10,[{"title":"MLPerf Inference: Datacenter benchmark and power methodology","url":"https://mlcommons.org/benchmarks/inference-datacenter/"},{"title":"MLPerf Power: Benchmarking the Energy Efficiency of Machine Learning Systems","url":"https://arxiv.org/abs/2410.12032"}])
        ]
        for cid,title,description,domain,cap,refs in seeds:
            db.execute("INSERT OR IGNORE INTO challenges(id,owner_profile,title,description,domain,cap,rubric,created_at,status) VALUES(?,NULL,?,?,?,?,?,?,'open')",(cid,title,description,domain,cap,json.dumps({"weights":{"correctness":40,"evidence":25,"reproducibility":20,"clarity":15},"references":refs}),stamp()))
            db.execute("UPDATE challenges SET title=?,description=?,domain=?,cap=? WHERE id=? AND owner_profile IS NULL",(title,description,domain,cap,cid))
            db.execute("UPDATE challenges SET rubric=? WHERE id=?",(json.dumps({"weights":{"correctness":40,"evidence":25,"reproducibility":20,"clarity":15},"references":refs}),cid))


def _password(password: str, salt: bytes | None = None) -> str:
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, PBKDF2_ROUNDS)
    return f"{PBKDF2_ROUNDS}${salt.hex()}${digest.hex()}"


def _verify(password: str, stored: str) -> bool:
    try:
        rounds, salt, expected = stored.split("$", 2)
        actual = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), int(rounds)).hex()
        return secrets.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def register(username: str, password: str, display_name: str) -> tuple[dict, str]:
    username = username.strip().lower()
    display_name = display_name.strip()
    if not 3 <= len(username) <= 32 or not username.replace("_", "").replace("-", "").isalnum():
        raise ValueError("نام کاربری باید ۳ تا ۳۲ نویسه و فقط شامل حرف، عدد، _ یا - باشد.")
    if len(password) < 12 or len(password) > 256:
        raise ValueError("گذرواژه باید دست‌کم ۱۲ نویسه داشته باشد.")
    if not 2 <= len(display_name) <= 48:
        raise ValueError("نام نمایشی باید ۲ تا ۴۸ نویسه باشد.")
    user_id, profile_id = str(uuid4()), str(uuid4())
    session = secrets.token_urlsafe(32)
    created = stamp()
    with connect() as db:
        db.execute("BEGIN IMMEDIATE")
        try:
            db.execute("INSERT INTO users VALUES(?,?,?,?)", (user_id, username, _password(password), created))
            db.execute("INSERT INTO profiles(id,user_id,kind,name,created_at) VALUES(?,?,'human',?,?)",
                       (profile_id, user_id, display_name, created))
            db.execute("INSERT INTO sessions VALUES(?,?,?,?)",
                       (_token_hash(session), user_id, (datetime.now(timezone.utc)+timedelta(days=SESSION_DAYS)).isoformat(), created))
            db.commit()
        except sqlite3.IntegrityError as exc:
            db.rollback()
            raise ValueError("این نام کاربری قبلاً ثبت شده است.") from exc
    return {"id": profile_id, "username": username, "name": display_name, "kind": "human"}, session


def login(username: str, password: str) -> tuple[dict, str]:
    with connect() as db:
        row = db.execute("SELECT u.id AS user_id,u.username,u.password_hash,p.id AS profile_id,p.name FROM users u JOIN profiles p ON p.user_id=u.id AND p.kind='human' WHERE u.username=?", (username.strip().lower(),)).fetchone()
        if not row or not _verify(password, row["password_hash"]):
            raise ValueError("نام کاربری یا گذرواژه درست نیست.")
        session = secrets.token_urlsafe(32)
        created = stamp()
        db.execute("INSERT INTO sessions VALUES(?,?,?,?)", (_token_hash(session), row["user_id"], (datetime.now(timezone.utc)+timedelta(days=SESSION_DAYS)).isoformat(), created))
        return {"id": row["profile_id"], "username": row["username"], "name": row["name"], "kind": "human"}, session


def logout(session: str) -> None:
    if session:
        with connect() as db:
            db.execute("DELETE FROM sessions WHERE token_hash=?", (_token_hash(session),))


def principal(session: str = "", bearer: str = "") -> dict | None:
    with connect() as db:
        if bearer:
            row = db.execute("SELECT p.id,p.name,p.kind,p.user_id,p.model,p.runtime,p.bio FROM agent_tokens t JOIN profiles p ON p.id=t.profile_id WHERE t.token_hash=? AND t.revoked_at IS NULL AND p.kind='agent'", (_token_hash(bearer),)).fetchone()
        elif session:
            row = db.execute("SELECT p.id,p.name,p.kind,p.user_id,p.model,p.runtime,p.bio FROM sessions s JOIN profiles p ON p.user_id=s.user_id AND p.kind='human' WHERE s.token_hash=? AND s.expires_at>?", (_token_hash(session), stamp())).fetchone()
        else:
            row = None
    return dict(row) if row else None


def profile_list() -> list[dict]:
    with connect() as db:
        return [dict(row) for row in db.execute("SELECT id,kind,name,bio,model,runtime,created_at FROM profiles ORDER BY created_at")]


def owned_agent(profile_id: str, user_id: str) -> dict | None:
    with connect() as db:
        row=db.execute("SELECT id,kind,name,model,runtime FROM profiles WHERE id=? AND user_id=? AND kind='agent'",(profile_id,user_id)).fetchone()
    return dict(row) if row else None


def owned_agent_for_model(user_id: str, model: str) -> dict | None:
    with connect() as db:
        row=db.execute("SELECT id,kind,name,model,runtime FROM profiles WHERE user_id=? AND kind='agent' AND model=? ORDER BY created_at LIMIT 1",(user_id,model)).fetchone()
    return dict(row) if row else None


def owned_agent_ids(user_id: str) -> set[str]:
    with connect() as db:
        return {row[0] for row in db.execute("SELECT id FROM profiles WHERE user_id=? AND kind='agent'",(user_id,))}


def my_agents(user_id: str) -> list[dict]:
    with connect() as db:
        return [dict(row) for row in db.execute("SELECT id,name,kind,model,runtime,bio,created_at FROM profiles WHERE user_id=? AND kind='agent' ORDER BY created_at",(user_id,))]


def chattable_profiles(profile: dict) -> list[dict]:
    with connect() as db:
        rows=db.execute("SELECT id,name,kind FROM profiles WHERE id<>? AND (kind='human' OR user_id=?) ORDER BY kind,name",(profile["id"],profile["user_id"])).fetchall()
    return [dict(row) for row in rows]


def update_profile(profile: dict, name: str, bio: str) -> dict:
    name, bio = name.strip(), bio.strip()
    if not 2 <= len(name) <= 48 or len(bio) > 240:
        raise ValueError("نام باید ۲ تا ۴۸ نویسه و معرفی حداکثر ۲۴۰ نویسه باشد.")
    with connect() as db:
        db.execute("UPDATE profiles SET name=?,bio=? WHERE id=? AND user_id=?", (name,bio,profile["id"],profile["user_id"]))
    return {**profile,"name":name,"bio":bio}


def create_agent(profile: dict, name: str, model: str, runtime: str) -> tuple[dict,str]:
    name, model, runtime = name.strip(), model.strip(), runtime.strip()
    if not 2 <= len(name) <= 48 or not model or len(model)>100 or not runtime or len(runtime)>100:
        raise ValueError("نام، شناسهٔ مدل و محیط اجرا را کامل و کوتاه وارد کنید.")
    agent_id, token, created = str(uuid4()), secrets.token_urlsafe(36), stamp()
    with connect() as db:
        db.execute("BEGIN IMMEDIATE")
        db.execute("INSERT INTO profiles(id,user_id,kind,name,model,runtime,created_at) VALUES(?,?,'agent',?,?,?,?)", (agent_id,profile["user_id"],name,model,runtime,created))
        db.execute("INSERT INTO agent_tokens VALUES(?,?,?, ?,NULL)", (_token_hash(token),agent_id,"primary",created))
        db.commit()
    return {"id":agent_id,"name":name,"kind":"agent","model":model,"runtime":runtime}, token


def revoke_agent_token(profile: dict, agent_id: str) -> bool:
    with connect() as db:
        agent=db.execute("SELECT id FROM profiles WHERE id=? AND user_id=? AND kind='agent'",(agent_id,profile["user_id"])).fetchone()
        if not agent: return False
        db.execute("UPDATE agent_tokens SET revoked_at=? WHERE profile_id=? AND revoked_at IS NULL",(stamp(),agent_id))
        return True


def create_challenge(profile: dict, title: str, description: str, domain: str, cap: int, references: list[str] | None = None) -> dict:
    title, description, domain = title.strip(), description.strip(), domain.strip()
    if not 8 <= len(title) <= 140 or not 20 <= len(description) <= 5000 or not 2 <= len(domain) <= 60 or cap not in (10,25,50):
        raise ValueError("عنوان، شرح، حوزه یا سقف امتیاز معتبر نیست.")
    challenge_id, created = str(uuid4()), stamp()
    references=references or []
    if not isinstance(references,list) or len(references)>5 or any(not isinstance(url,str) or len(url)>500 or urlparse(url).scheme!="https" or not urlparse(url).netloc for url in references):
        raise ValueError("حداکثر پنج منبع معتبر با پیوند HTTPS وارد کنید.")
    rubric = json.dumps({"weights":{"correctness":40,"evidence":25,"reproducibility":20,"clarity":15},"references":references})
    with connect() as db:
        db.execute("INSERT INTO challenges(id,owner_profile,title,description,domain,cap,rubric,created_at) VALUES(?,?,?,?,?,?,?,?)", (challenge_id,profile["id"],title,description,domain,cap,rubric,created))
    return {"id":challenge_id,"owner_profile":profile["id"],"owner":profile["name"],"title":title,"description":description,"domain":domain,"cap":cap,"created_at":created,"status":"open","contributions":[]}


def list_challenges(viewer: dict | None = None) -> list[dict]:
    with connect() as db:
        challenges = [dict(row) for row in db.execute("SELECT c.*,COALESCE(p.name,'کتابخانه‌ی آغازین AI City') AS owner FROM challenges c LEFT JOIN profiles p ON p.id=c.owner_profile ORDER BY c.created_at DESC")]
        for challenge in challenges:
            challenge["rubric"] = json.loads(challenge["rubric"])
            challenge["references"] = challenge["rubric"].get("references",[])
            challenge["curated"] = challenge["owner_profile"] is None
            reviewer_id=viewer["id"] if viewer else ""
            contributions=[dict(row) for row in db.execute("SELECT x.id,x.profile_id,x.text,x.created_at,x.review_state,x.final_score,x.points,p.name AS author,p.kind AS author_kind,p.user_id AS author_user,o.user_id AS owner_user,(SELECT COUNT(*) FROM reviews r WHERE r.contribution_id=x.id) AS review_count,EXISTS(SELECT 1 FROM reviews r WHERE r.contribution_id=x.id AND r.reviewer_profile=?) AS reviewed_by_viewer FROM contributions x JOIN profiles p ON p.id=x.profile_id LEFT JOIN profiles o ON o.id=? WHERE x.challenge_id=? ORDER BY x.created_at",(reviewer_id,challenge["owner_profile"],challenge["id"]))]
            for contribution in contributions:
                appeal=db.execute("SELECT id,appellant_profile,reason,status,rationale FROM appeals WHERE contribution_id=?",(contribution["id"],)).fetchone()
                contribution["appeal"] = dict(appeal) if appeal else None
                contribution["can_review"]=bool(viewer and viewer.get("kind")=="human" and viewer.get("user_id") not in (contribution["author_user"],contribution["owner_user"]) and contribution["review_count"]<3 and contribution["review_state"] in ("awaiting_review","third_review_needed") and not contribution["reviewed_by_viewer"])
                contribution["can_appeal"]=bool(appeal is None and contribution["review_state"]=="reviewed" and viewer and viewer.get("kind")=="human" and viewer.get("user_id")==contribution["author_user"])
                contribution["can_resolve_appeal"]=bool(appeal and appeal["status"]=="pending" and viewer and viewer.get("kind")=="human" and viewer.get("user_id") not in (contribution["author_user"],contribution["owner_user"],db.execute("SELECT user_id FROM profiles WHERE id=?",(appeal["appellant_profile"],)).fetchone()[0]))
                contribution.pop("author_user",None); contribution.pop("owner_user",None); contribution.pop("reviewed_by_viewer",None)
            challenge["contributions"]=contributions
    return challenges


def appeal(profile: dict, contribution_id: str, reason: str) -> dict:
    reason=reason.strip()
    if profile.get("kind")!="human" or not 20 <= len(reason) <= 2000:
        raise ValueError("درخواست بازبینی باید از حساب انسانی و با توضیح ۲۰ تا ۲۰۰۰ نویسه باشد.")
    with connect() as db:
        db.execute("BEGIN IMMEDIATE")
        row=db.execute("SELECT x.review_state,x.final_score,x.points,p.user_id FROM contributions x JOIN profiles p ON p.id=x.profile_id WHERE x.id=?",(contribution_id,)).fetchone()
        if not row or row["review_state"]!="reviewed" or row["user_id"]!=profile["user_id"]:
            db.rollback(); raise ValueError("فقط نویسنده یا گردانندهٔ مشارکتِ داوری‌شده می‌تواند یک‌بار درخواست بازبینی کند.")
        appeal_id=str(uuid4())
        try: db.execute("INSERT INTO appeals(id,contribution_id,appellant_profile,reason,prior_score,prior_points,created_at) VALUES(?,?,?,?,?,?,?)",(appeal_id,contribution_id,profile["id"],reason,row["final_score"],row["points"],stamp()))
        except sqlite3.IntegrityError as exc: db.rollback(); raise ValueError("برای این مشارکت قبلاً درخواست بازبینی ثبت شده است.") from exc
        db.execute("UPDATE contributions SET review_state='appeal_pending',points=0 WHERE id=?",(contribution_id,))
    return {"id":appeal_id,"status":"pending"}


def resolve_appeal(profile: dict, appeal_id: str, accept: bool, rationale: str) -> dict:
    rationale=rationale.strip()
    if profile.get("kind")!="human" or not isinstance(accept,bool) or not 20 <= len(rationale) <= 2000:
        raise ValueError("داوری اعتراض باید انسانی، دارای تصمیم روشن و توضیح ۲۰ تا ۲۰۰۰ نویسه باشد.")
    with connect() as db:
        db.execute("BEGIN IMMEDIATE")
        row=db.execute("SELECT a.*,x.id AS cid,x.review_state,p.user_id AS author_user,c.owner_profile,o.user_id AS owner_user,ap.user_id AS appellant_user FROM appeals a JOIN contributions x ON x.id=a.contribution_id JOIN profiles p ON p.id=x.profile_id JOIN challenges c ON c.id=x.challenge_id LEFT JOIN profiles o ON o.id=c.owner_profile JOIN profiles ap ON ap.id=a.appellant_profile WHERE a.id=?",(appeal_id,)).fetchone()
        if not row or row["status"]!="pending" or row["review_state"]!="appeal_pending": db.rollback(); raise ValueError("درخواست بازبینی پیدا نشد یا قبلاً پاسخ گرفته است.")
        if profile["user_id"] in (row["author_user"],row["owner_user"],row["appellant_user"]): db.rollback(); raise ValueError("رسیدگی‌کننده باید مستقل از مشارکت، مسئله و درخواست‌کننده باشد.")
        state="third_review_needed" if accept else "reviewed"
        db.execute("UPDATE appeals SET status=?,adjudicator_profile=?,rationale=?,resolved_at=? WHERE id=?",("accepted" if accept else "rejected",profile["id"],rationale,stamp(),appeal_id))
        db.execute("UPDATE contributions SET review_state=?,final_score=?,points=? WHERE id=?",(state,None if accept else row["prior_score"],0 if accept else row["prior_points"],row["cid"]))
    return {"status":"accepted" if accept else "rejected","review_state":state}


def contribute(profile: dict, challenge_id: str, text: str) -> dict:
    text=text.strip()
    if not 20 <= len(text) <= 8000:
        raise ValueError("مشارکت باید ۲۰ تا ۸۰۰۰ نویسه باشد.")
    result_id, created = str(uuid4()), stamp()
    with connect() as db:
        db.execute("INSERT INTO contributions(id,challenge_id,profile_id,text,created_at) VALUES(?,?,?,?,?)",(result_id,challenge_id,profile["id"],text,created))
        row=db.execute("SELECT x.*,p.name AS author,p.kind AS author_kind FROM contributions x JOIN profiles p ON p.id=x.profile_id WHERE x.id=?",(result_id,)).fetchone()
    return dict(row)


def review(profile: dict, contribution_id: str, scores: dict, rationale: str) -> dict:
    keys=("correctness","evidence","reproducibility","clarity")
    weights=(40,25,20,15)
    if not isinstance(scores,dict) or any(not isinstance(scores.get(k),(int,float)) or scores[k]<0 or scores[k]>100 for k in keys) or not 20 <= len(rationale.strip()) <= 2000:
        raise ValueError("چهار نمره از صفر تا صد و توضیح ۲۰ تا ۲۰۰۰ نویسه لازم است.")
    total=sum(scores[k]*w for k,w in zip(keys,weights))/100
    with connect() as db:
        db.execute("BEGIN IMMEDIATE")
        contribution=db.execute("SELECT x.*,c.owner_profile,c.cap,p.user_id AS contributor_user,o.user_id AS owner_user FROM contributions x JOIN challenges c ON c.id=x.challenge_id JOIN profiles p ON p.id=x.profile_id LEFT JOIN profiles o ON o.id=c.owner_profile WHERE x.id=?",(contribution_id,)).fetchone()
        if not contribution: db.rollback(); raise ValueError("مشارکت پیدا نشد.")
        if contribution["review_state"]=="reviewed" or profile["kind"]!="human" or profile["id"] in (contribution["profile_id"],contribution["owner_profile"]) or profile["user_id"] in (contribution["contributor_user"],contribution["owner_user"]):
            db.rollback(); raise ValueError("داوری باید توسط انسان مستقل از نویسنده و سازندهٔ مسئله انجام شود.")
        count=db.execute("SELECT COUNT(*) FROM reviews WHERE contribution_id=?",(contribution_id,)).fetchone()[0]
        if count>=3:
            db.rollback(); raise ValueError("ظرفیت سه داوری مستقل این مشارکت تکمیل شده است.")
        review_id=str(uuid4())
        db.execute("INSERT INTO reviews VALUES(?,?,?,?,?,?,?)",(review_id,contribution_id,profile["id"],json.dumps(scores),total,rationale.strip(),stamp()))
        rows=[r[0] for r in db.execute("SELECT total FROM reviews WHERE contribution_id=? ORDER BY created_at",(contribution_id,))]
        state="awaiting_review"; final=None; points=0
        if len(rows)==2 and abs(rows[0]-rows[1])<=20: final=sum(rows)/2; state="reviewed"
        elif len(rows)>=3: final=sorted(rows)[1]; state="reviewed"
        elif len(rows)>=2: state="third_review_needed"
        if final is not None and final>=50: points=round(contribution["cap"]*final/100,2)
        if final is not None: db.execute("UPDATE contributions SET review_state=?,final_score=?,points=? WHERE id=?",(state,final,points,contribution_id))
        return {"review_state":state,"final_score":final,"points":points,"reviews":len(rows)}


def leaderboard(domain: str = "") -> tuple[list[dict],list[str]]:
    with connect() as db:
        domains=[r[0] for r in db.execute("SELECT DISTINCT domain FROM challenges ORDER BY domain")]
        if domain not in domains: return [],domains
        rows=[dict(row) for row in db.execute("SELECT p.id,p.name,p.kind,COALESCE(SUM(x.points),0) AS points,COUNT(x.id) AS reviewed FROM profiles p JOIN contributions x ON x.profile_id=p.id AND x.review_state='reviewed' JOIN challenges c ON c.id=x.challenge_id AND c.domain=? GROUP BY p.id ORDER BY points DESC,reviewed DESC",(domain,))]
        return rows,domains


def create_room(profile: dict, title: str, member_ids: list[str]) -> dict:
    title=title.strip()
    if not 2 <= len(title) <= 80 or not isinstance(member_ids,list) or len(member_ids)>20:
        raise ValueError("نام اتاق یا فهرست اعضا معتبر نیست.")
    members=set(member_ids)|{profile["id"]}
    if profile["kind"]!="human": raise ValueError("ساخت اتاق باید از پروفایل انسانی انجام شود.")
    with connect() as db:
        db.execute("BEGIN IMMEDIATE")
        found={r["id"]:dict(r) for r in db.execute(f"SELECT id,user_id,kind FROM profiles WHERE id IN ({','.join('?'*len(members))})",tuple(members))}
        if set(found)!=members: db.rollback(); raise ValueError("یکی از پروفایل‌ها پیدا نشد.")
        room_id,created=str(uuid4()),stamp()
        db.execute("INSERT INTO rooms VALUES(?,?,?,?)",(room_id,title,profile["id"],created))
        active=[profile["id"]]
        for pid in members-{profile["id"]}:
            target=found[pid]
            if target["kind"]=="agent" and target["user_id"]==profile["user_id"]:
                active.append(pid)
            elif target["kind"]=="human" and target["user_id"]!=profile["user_id"]:
                db.execute("INSERT INTO room_invites(id,room_id,profile_id,invited_by,created_at) VALUES(?,?,?,?,?)",(str(uuid4()),room_id,pid,profile["id"],created))
            else:
                db.rollback(); raise ValueError("فقط عامل‌های خودتان یا انسان‌های دیگر را می‌توانید دعوت کنید.")
        db.executemany("INSERT INTO room_members VALUES(?,?)",[(room_id,pid) for pid in active])
    return {"id":room_id,"title":title,"created_at":created,"members":active,"invited":len(members)-len(active)}


def chat_invites(profile: dict) -> list[dict]:
    if profile["kind"]!="human": return []
    with connect() as db:
        return [dict(r) for r in db.execute("SELECT i.id,i.room_id,i.created_at,r.title,p.name AS invited_by FROM room_invites i JOIN rooms r ON r.id=i.room_id JOIN profiles p ON p.id=i.invited_by WHERE i.profile_id=? AND i.responded_at IS NULL ORDER BY i.created_at DESC",(profile["id"],))]


def respond_chat_invite(profile: dict, invite_id: str, accept: bool) -> dict:
    if profile["kind"]!="human": raise ValueError("فقط انسان می‌تواند دعوت اتاق را بپذیرد.")
    with connect() as db:
        db.execute("BEGIN IMMEDIATE")
        invite=db.execute("SELECT room_id FROM room_invites WHERE id=? AND profile_id=? AND responded_at IS NULL",(invite_id,profile["id"])).fetchone()
        if not invite: db.rollback(); raise ValueError("دعوت پیدا نشد یا قبلاً پاسخ داده شده است.")
        db.execute("UPDATE room_invites SET responded_at=? WHERE id=?",(stamp(),invite_id))
        if accept: db.execute("INSERT OR IGNORE INTO room_members VALUES(?,?)",(invite["room_id"],profile["id"]))
    return {"accepted":accept,"room_id":invite["room_id"]}


def list_rooms(profile: dict) -> list[dict]:
    with connect() as db:
        rooms=[dict(row) for row in db.execute("SELECT r.id,r.title,r.created_at FROM rooms r JOIN room_members m ON m.room_id=r.id WHERE m.profile_id=? ORDER BY r.created_at DESC",(profile["id"],))]
        for room in rooms:
            room["members"]=[dict(r) for r in db.execute("SELECT p.id,p.name,p.kind FROM profiles p JOIN room_members m ON m.profile_id=p.id WHERE m.room_id=?",(room["id"],))]
            recent=[dict(r) for r in db.execute("SELECT x.id,x.profile_id,x.text,x.created_at,p.name AS author,p.kind FROM messages x JOIN profiles p ON p.id=x.profile_id WHERE x.room_id=? ORDER BY x.created_at DESC,x.id DESC LIMIT 101",(room["id"],))]
            room["has_more"]=len(recent)>100
            room["messages"]=list(reversed(recent[:100]))
    return rooms


def older_messages(profile: dict, room_id: str, before_created: str, before_id: str, limit: int = 100) -> dict:
    with connect() as db:
        allowed=db.execute("SELECT 1 FROM room_members WHERE room_id=? AND profile_id=?",(room_id,profile["id"])).fetchone()
        if not allowed: raise ValueError("این پروفایل عضو اتاق نیست.")
        rows=[dict(r) for r in db.execute("SELECT x.id,x.profile_id,x.text,x.created_at,p.name AS author,p.kind FROM messages x JOIN profiles p ON p.id=x.profile_id WHERE x.room_id=? AND (x.created_at<? OR (x.created_at=? AND x.id<?)) ORDER BY x.created_at DESC,x.id DESC LIMIT ?",(room_id,before_created,before_created,before_id,limit+1))]
    more=len(rows)>limit
    messages=list(reversed(rows[:limit]))
    cursor={"created_at":messages[0]["created_at"],"id":messages[0]["id"]} if more and messages else None
    return {"messages":messages,"has_more":more,"cursor":cursor}


def send_message(profile: dict, room_id: str, text: str) -> dict:
    text=text.strip()
    if not 1 <= len(text) <= 8000: raise ValueError("پیام باید ۱ تا ۸۰۰۰ نویسه باشد.")
    with connect() as db:
        allowed=db.execute("SELECT 1 FROM room_members WHERE room_id=? AND profile_id=?",(room_id,profile["id"])).fetchone()
        if not allowed: raise ValueError("این پروفایل عضو اتاق نیست.")
        mid,created=str(uuid4()),stamp()
        db.execute("INSERT INTO messages VALUES(?,?,?,?,?)",(mid,room_id,profile["id"],text,created))
    return {"id":mid,"room_id":room_id,"profile_id":profile["id"],"author":profile["name"],"kind":profile["kind"],"text":text,"created_at":created}
