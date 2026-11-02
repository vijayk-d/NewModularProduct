"""Run exactly the release verification (same as `checkpoint` and `deliver`) without committing or deploying.

Used by GitHub Actions CI and safe to run locally:  py tools/deploy/ci_verify.py
It copies the tracked/allowed source files into a temporary folder, then runs npm ci, pip install,
every Node test, the Python worker tests, test_local_delivery.py and the Playwright release suite.
"""
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import local_delivery as ld  # noqa: E402


def main():
    candidate = Path(tempfile.mkdtemp(prefix='nmp-ci-'))
    log = ld.ROOT / 'var/maintenance/delivery' / ('ci-' + ld.stamp() + '.log')
    log.parent.mkdir(parents=True, exist_ok=True)
    for name in ld.source_files():
        target = candidate / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes((ld.ROOT / name).read_bytes())
    try:
        runtime = ld.verify_candidate(candidate, log)
    except BaseException:
        print('CI VERIFICATION FAILED. Log: ' + str(log), file=sys.stderr)
        text = log.read_text(encoding='utf-8', errors='replace') if log.exists() else ''
        print(text[-20000:], file=sys.stderr)
        raise
    print('CI VERIFICATION PASSED: ' + runtime['nodeVersion'] + ' / ' + runtime['pythonVersion'])
    print('Log: ' + str(log))


if __name__ == '__main__':
    try:
        main()
    except SystemExit:
        raise
    except Exception as error:  # same error style as local_delivery.py
        print('ERROR: ' + str(error), file=sys.stderr)
        sys.exit(1)
