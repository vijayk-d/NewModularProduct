"""Read-only host probe for the System check page. Never opens a CV file: it reads file attributes only,
so a OneDrive online-only file is reported without triggering a download."""
import os, re, stat
from pathlib import Path
from cv_docx import need

# Windows attributes that mean the file's data is in the cloud, not on this PC.
CLOUD_ONLY = 0x00400000 | 0x00040000 | 0x00001000  # RECALL_ON_DATA_ACCESS | RECALL_ON_OPEN | OFFLINE


def commit_free_gb():
    if os.name != 'nt':
        return None
    try:
        import ctypes
        class Status(ctypes.Structure):
            _fields_ = [('dwLength', ctypes.c_ulong), ('dwMemoryLoad', ctypes.c_ulong)] + [(n, ctypes.c_ulonglong) for n in ['ullTotalPhys', 'ullAvailPhys', 'ullTotalPageFile', 'ullAvailPageFile', 'ullTotalVirtual', 'ullAvailVirtual', 'ullAvailExtendedVirtual']]
        m = Status(); m.dwLength = ctypes.sizeof(Status)
        return round(m.ullAvailPageFile / 2 ** 30, 2) if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(m)) else None
    except Exception:
        return None


def availability(root, relative):
    need(isinstance(relative, str) and relative and not re.search(r'[\x00-\x1f:]', relative) and not relative.startswith(('/', chr(92))), 'CV_PATH_INVALID')
    parts = relative.replace(chr(92), '/').split('/')
    need(not any(p in ['', '.', '..'] for p in parts), 'CV_PATH_INVALID')
    folder = Path(root).resolve(strict=True)
    file = folder / Path(*parts)
    try:
        info = os.stat(file, follow_symlinks=False)
    except FileNotFoundError:
        return {'path': '/'.join(parts), 'exists': False, 'cloudOnly': False}
    attrs = getattr(info, 'st_file_attributes', 0)
    return {'path': '/'.join(parts), 'exists': stat.S_ISREG(info.st_mode), 'cloudOnly': bool(attrs & CLOUD_ONLY)}


def probe(root, relative_paths):
    need(isinstance(relative_paths, list) and len(relative_paths) <= 200, 'PROBE_INPUT_INVALID')
    return {'commitFreeGb': commit_free_gb(), 'files': [availability(root, p) for p in relative_paths]}
