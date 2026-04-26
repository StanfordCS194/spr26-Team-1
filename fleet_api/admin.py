"""CLI for bootstrapping fleets and enrollment tokens.

Usage:
    python -m fleet_api.admin create-fleet "My Fleet"
    python -m fleet_api.admin create-token <fleet_id>
"""

import secrets
import sys

from .db import Base, SessionLocal, engine
from .models import EnrollmentToken, Fleet


def main():
    Base.metadata.create_all(bind=engine)
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    cmd = sys.argv[1]
    db = SessionLocal()
    try:
        if cmd == "create-fleet":
            name = sys.argv[2]
            fleet = Fleet(name=name)
            db.add(fleet)
            db.commit()
            db.refresh(fleet)
            print(f"fleet_id={fleet.id}")
        elif cmd == "create-token":
            fleet_id = sys.argv[2]
            token = "et_" + secrets.token_urlsafe(32)
            et = EnrollmentToken(fleet_id=fleet_id, token=token)
            db.add(et)
            db.commit()
            print(f"enrollment_token={token}")
        else:
            print(__doc__)
            sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    main()
