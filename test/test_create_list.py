import database as db_mod
import schemas
from sqlalchemy.orm import Session

def test_create_list():
    db_mod.init_db()
    db = db_mod.SessionLocal()
    try:
        name = "Test List 1"
        print(f"Creating list: {name}")
        db_list = db_mod.TickerList(name=name)
        db.add(db_list)
        db.commit()
        db.refresh(db_list)
        print(f"Success! ID: {db_list.id}")
    except Exception as e:
        print(f"Error creating list: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    test_create_list()
