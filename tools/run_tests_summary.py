from pathlib import Path
import json
import os
import re
import subprocess
import sys
import time
import xml.etree.ElementTree as ET

root = Path.cwd()
reports = root / "test-summary-artifacts"
reports.mkdir(exist_ok=True)
summary = []

def emit(text=""):
    summary.append(str(text))
    print(text)

def run(label, command, env=None):
    started = time.monotonic()
    try:
        result = subprocess.run(
            command,
            cwd=root,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            encoding="utf-8",
            errors="replace"
        )
        output = result.stdout
        code = result.returncode
    except OSError as error:
        output = str(error)
        code = 1

    elapsed = time.monotonic() - started
    (reports / f"{label}.log").write_text(output, encoding="utf-8")
    return code, elapsed, output

def clean(text):
    return re.sub(r"\x1b\[[0-?]*[ -/]*[@-~]", "", str(text))

failed = False

node_report = reports / "node-results.xml"
node_report.unlink(missing_ok=True)
node_code, elapsed, node_output = run("node", [
    "node", "--test",
    "--test-reporter=junit",
    f"--test-reporter-destination={node_report}",
    "tests/**/*.test.js"
])

emit("===== Node tests =====")
try:
    tree = ET.parse(node_report)
    cases = tree.findall(".//testcase")
    failures = [
        case for case in cases
        if case.find("failure") is not None or case.find("error") is not None
    ]
    skipped = sum(case.find("skipped") is not None for case in cases)
    passed = len(cases) - len(failures) - skipped

    xml_text = node_report.read_text(encoding="utf-8-sig")
    node_counts = {
        key: int(value)
        for key, value in re.findall(
            r"<!--\s*(tests|pass|fail|skipped|cancelled)\s+(\d+)\s*-->",
            xml_text
        )
    }

    if all(key in node_counts for key in ("tests", "pass", "fail")):
        emit(
            f"{'PASS' if node_code == 0 and not failures else 'FAIL'}: "
            f"{node_counts['tests']} tests, "
            f"{node_counts['pass']} passed, "
            f"{node_counts['fail']} failed, "
            f"{node_counts.get('skipped', skipped)} skipped, "
            f"{node_counts.get('cancelled', 0)} cancelled; {elapsed:.2f}s"
        )
    else:
        emit(
            f"{'PASS' if node_code == 0 and not failures else 'FAIL'}: "
            f"{passed} passed JUnit cases, {len(failures)} failed, "
            f"{skipped} skipped; {elapsed:.2f}s"
        )
    for case in failures:
        emit(f"\nFAILURE: {case.get('name', 'Unnamed test')}")
        for tag in ("failure", "error"):
            detail = case.find(tag)
            if detail is not None:
                emit(clean(detail.get("message", "")))
                emit(clean("".join(detail.itertext())).strip())

    failed |= node_code != 0 or bool(failures)
    if node_code != 0 and not failures:
        emit("Runner error:\n" + clean(node_output).strip())
except (OSError, ET.ParseError) as error:
    emit(f"FAIL: could not read Node report: {error}")
    emit(clean(node_output).strip())
    failed = True

playwright_report = reports / "browser-results.json"
playwright_report.unlink(missing_ok=True)
env = os.environ.copy()
env["PLAYWRIGHT_JSON_OUTPUT_FILE"] = str(playwright_report)

npm = "npm.cmd" if os.name == "nt" else "npm"
browser_code, elapsed, browser_output = run(
    "browser",
    [npm, "run", "test:ui", "--", "--reporter=json"],
    env=env
)

emit("\n===== Browser tests =====")
try:
    report = json.loads(playwright_report.read_text(encoding="utf-8-sig"))
    stats = report.get("stats", {})
    unexpected = stats.get("unexpected", 0)
    flaky = stats.get("flaky", 0)

    emit(
        f"{'PASS' if browser_code == 0 and not unexpected else 'FAIL'}: "
        f"{stats.get('expected', 0)} passed, "
        f"{unexpected} failed, {flaky} flaky, "
        f"{stats.get('skipped', 0)} skipped; {elapsed:.2f}s"
    )

    def walk(suites, parents=()):
        for suite in suites:
            titles = parents + (suite.get("title", ""),)
            for spec in suite.get("specs", []):
                for test in spec.get("tests", []):
                    if test.get("status") not in ("unexpected", "flaky"):
                        continue

                    emit(
                        "\nFAILURE/RETRY: " +
                        " > ".join(filter(None, titles + (spec.get("title", ""),)))
                    )
                    emit(
                        f"{spec.get('file', '')}:{spec.get('line', '')} "
                        f"[{test.get('projectName', '')}]"
                    )
                    for attempt in test.get("results", []):
                        errors = attempt.get("errors", [])
                        if not errors and attempt.get("error"):
                            errors = [attempt["error"]]
                        for error in errors:
                            emit(clean(
                                error.get("stack") or error.get("message") or str(error)
                            ))
                        if errors:
                            for stream in ("stdout", "stderr"):
                                for entry in attempt.get(stream, []):
                                    if entry.get("text"):
                                        emit(clean(entry["text"]).rstrip())

            walk(suite.get("suites", []), titles)

    walk(report.get("suites", []))
    for error in report.get("errors", []):
        emit(clean(error.get("stack") or error.get("message") or str(error)))

    failed |= browser_code != 0 or bool(unexpected)
    if browser_code != 0 and not unexpected and not report.get("errors"):
        emit("Runner error:\n" + clean(browser_output).strip())
except (OSError, ValueError) as error:
    emit(f"FAIL: could not read browser report: {error}")
    emit(clean(browser_output).strip())
    failed = True

emit("\n===== Diff check =====")
diff_code, _, diff_output = run("diff-check", ["git", "diff", "--check"])
emit("PASS" if diff_code == 0 else "FAIL")
if diff_output.strip():
    emit(clean(diff_output).strip())
failed |= diff_code != 0

emit("\n===== Overall =====")
emit("FAIL" if failed else "PASS")
(reports / "summary.txt").write_text("\n".join(summary) + "\n", encoding="utf-8")
sys.exit(1 if failed else 0)
