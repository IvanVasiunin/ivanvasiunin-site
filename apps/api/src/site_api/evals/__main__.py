"""Allow `python -m site_api.evals`; all logic lives in `cli.py` so it can be tested."""

from site_api.evals.cli import main

if __name__ == "__main__":
    raise SystemExit(main())
