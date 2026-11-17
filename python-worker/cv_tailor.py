"""Tailor a copy of a DOCX CV: only the Profile and Key achievements sections are replaced.
Offline and bounded. The source file is read, never written; everything else in the package is copied byte for byte."""
import io, re, copy, zipfile, xml.etree.ElementTree as ET
from cv_docx import package, xml, need, W

PROFILE = {'profile', 'professional profile', 'personal profile', 'career profile', 'profile summary', 'summary',
           'professional summary', 'career summary', 'executive summary', 'personal statement', 'about me',
           'executive profile', 'personal summary', 'professional overview', 'career overview', 'overview'}
ACHIEVEMENTS = {'key achievements', 'achievements', 'selected achievements', 'career highlights', 'key accomplishments',
                'accomplishments', 'notable achievements', 'career achievements', 'key highlights', 'highlights',
                'selected accomplishments', 'major achievements', 'key successes', 'key results', 'achievements and impact',
                'key achievements and impact', 'notable accomplishments'}
OTHER = {'experience', 'professional experience', 'work experience', 'relevant experience', 'employment', 'employment history',
         'career history', 'work history', 'skills', 'key skills', 'core skills', 'core competencies', 'competencies',
         'technical skills', 'education', 'qualifications', 'education and qualifications', 'certifications', 'certificates',
         'training', 'professional development', 'languages', 'interests', 'references', 'projects', 'memberships',
         'awards', 'volunteering', 'additional information', 'tools', 'technologies', 'contact', 'contact details'}
KINDS = ('profile', 'achievements')
EXPERIENCE = {'experience', 'professional experience', 'work experience', 'relevant experience', 'employment',
              'employment history', 'career history', 'work history', 'professional history', 'career experience'}
MAX_ROLES = 25
XML_SPACE = '{http://www.w3.org/XML/1998/namespace}space'
MAX_LINES, MAX_LINE, MAX_PROFILE_LINE = 12, 600, 1200


def q(tag): return '{' + W + '}' + tag
def text(p): return ''.join(t.text or '' for t in p.iter(q('t')))
def norm(p): return re.sub(r'\s+', ' ', text(p)).strip()
def label(s):
    s = re.sub(r'\s+', ' ', str(s).replace('&', ' and ')).strip().lower()
    return re.sub(r'^[^a-z0-9]+|[^a-z0-9]+$', '', s)


# Owner-chosen headings for this CV, set per request: {'profile': label, 'achievements': label}.
CHOSEN = {}


def set_chosen(profile_heading='', achievements_heading=''):
    CHOSEN.clear()
    for kind, value in (('profile', profile_heading), ('achievements', achievements_heading)):
        need(isinstance(value, str) and len(value) <= 80, 'CV_HEADING_INVALID')
        if label(value):
            CHOSEN[kind] = label(value)
    need(len(set(CHOSEN.values())) == len(CHOSEN), 'CV_HEADING_INVALID')


def style(p):
    s = p.find(q('pPr') + '/' + q('pStyle'))
    return (s.get(q('val')) or '') if s is not None else ''


def is_bullet(p):
    ppr = p.find(q('pPr'))
    return ppr is not None and (ppr.find(q('numPr')) is not None or 'list' in style(p).lower())


def heading_kind(p):
    raw = text(p).strip()
    s = label(raw)
    if not s or len(s) > 45:
        return None
    for kind, chosen in CHOSEN.items():
        if s == chosen: return kind
    if s in PROFILE: return 'profile'
    if s in ACHIEVEMENTS: return 'achievements'
    if s in OTHER: return 'other'
    st = style(p).lower()
    if st.startswith('heading') or st == 'title': return 'other'
    if raw.isupper() and len(raw) <= 40 and not raw.endswith('.') and not is_bullet(p): return 'other'
    return None


def parents(root): return {c: p for p in root.iter() for c in p}


def body_after(container, start):
    """Paragraphs after `start` inside the same container, up to the next heading, table or section break."""
    kids = list(container)
    out = []
    for el in kids[kids.index(start) + 1:] if start is not None else kids:
        if el.tag != q('p') or heading_kind(el):
            break
        out.append(el)
    return out


def locate(root):
    """Finds each section once. Returns {kind: (container, heading, body paragraphs)}."""
    up = parents(root)
    found = {}
    for p in root.iter(q('p')):
        kind = heading_kind(p)
        if kind not in KINDS or kind in found:
            continue
        container = up[p]
        body = body_after(container, p)
        if not any(text(x).strip() for x in body) and container.tag == q('tc'):
            row = up.get(container)
            cells = [c for c in row if c.tag == q('tc')] if row is not None else []
            nxt = cells[cells.index(container) + 1] if cells.index(container) + 1 < len(cells) else None
            if nxt is not None and not any(heading_kind(x) for x in nxt.iter(q('p'))):
                container, body = nxt, body_after(nxt, None)
            elif nxt is None and row is not None:
                # Single-column table: the heading row is followed by a row holding the text.
                table = up.get(row)
                rows = [r for r in table if r.tag == q('tr')] if table is not None else []
                after = rows[rows.index(row) + 1] if row in rows and rows.index(row) + 1 < len(rows) else None
                cell = next((c for c in after if c.tag == q('tc')), None) if after is not None else None
                if cell is not None and not any(heading_kind(x) for x in cell.iter(q('p'))):
                    container, body = cell, body_after(cell, None)
        found[kind] = (container, p, body)
    if 'profile' not in found and 'profile' not in CHOSEN:
        opening = untitled_profile(root, up)
        if opening:
            found['profile'] = opening
    return found



def untitled_profile(root, up):
    """A profile with no heading: the first sentence-style paragraphs before the first known section heading,
    skipping the name, contact and headline lines (Title or Heading styles, or short lines)."""
    known = PROFILE | ACHIEVEMENTS | OTHER | EXPERIENCE
    for p in root.iter(q('p')):
        s = label(text(p))
        if s in known or s in CHOSEN.values():
            return None
        st = style(p).lower()
        raw = norm(p)
        if not raw or is_bullet(p) or st.startswith('heading') or st == 'title' or len(raw) < 60 or '.' not in raw:
            continue
        container = up[p]
        kids = list(container)
        body = [p]
        for el in kids[kids.index(p) + 1:]:
            if el.tag != q('p') or heading_kind(el) or is_bullet(el) or style(el).lower().startswith('heading'):
                break
            body.append(el)
        return container, None, body
    return None


def bold(p):
    runs = [r for r in p.iter(q('r')) if text(r).strip()]

    def on(r):
        b = r.find(q('rPr') + '/' + q('b'))
        return b is not None and b.get(q('val'), 'true').lower() not in ('0', 'false', 'off')
    return bool(runs) and all(on(r) for r in runs)


def candidates(root):
    """Short heading-like lines, so the owner can say which ones are Profile and Key achievements."""
    out = []
    for p in root.iter(q('p')):
        raw = re.sub(r'\s+', ' ', text(p)).strip()
        if not (2 <= len(raw) <= 45) or is_bullet(p) or raw in out:
            continue
        st = style(p).lower()
        if heading_kind(p) or bold(p) or raw.endswith(':') or st.startswith('heading') or st == 'title':
            out.append(raw)
        if len(out) >= 40:
            break
    return out


def display(p):
    """Readable line for an employer or title line: tabs become a separator."""
    out = []
    for el in p.iter():
        tag = el.tag.rsplit('}', 1)[-1]
        if tag == 't': out.append(el.text or '')
        elif tag in ('tab', 'ptab'): out.append(' | ')
    return re.sub(r'\s+', ' ', ''.join(out)).strip(' |')[:120]


def section_heading(p):
    """A real section heading (not an employer line in capitals): known names, chosen names or a Heading style."""
    s = label(text(p))
    if not s or len(s) > 45:
        return False
    st = style(p).lower()
    return s in PROFILE or s in ACHIEVEMENTS or s in OTHER or s in EXPERIENCE or s in CHOSEN.values() \
        or st.startswith('heading') or st == 'title'


def experience_roles(root):
    """Employer blocks under the Experience heading: header lines, then a run of bullets."""
    up = parents(root)
    heading = next((p for p in root.iter(q('p')) if label(text(p)) in EXPERIENCE and not is_bullet(p)), None)
    if heading is None:
        return None, []
    container = up[heading]
    kids = list(container)
    roles, header, current = [], [], None
    for el in kids[kids.index(heading) + 1:]:
        if el.tag != q('p') or section_heading(el):
            break
        if not text(el).strip():
            continue
        if is_bullet(el):
            if current is None:
                current = {'header': header, 'bullets': []}
                roles.append(current)
                header = []
            current['bullets'].append(el)
        else:
            current = None
            header.append(el)
    return (container, heading), roles[:MAX_ROLES]


def role_title(role):
    lines = [display(h) for h in role['header'][-2:] if display(h)]
    return ' — '.join(lines)[:200] or 'Role'


def describe(data, profile_heading='', achievements_heading=''):
    set_chosen(profile_heading, achievements_heading)
    z, root = package(data)
    z.close()
    found = locate(root)
    result = {'headings': candidates(root)}
    # Every non-empty line of the CV body, for the local ATS keyword match (read only).
    result['lines'] = [x for x in (norm(p) for p in root.iter(q('p'))) if x][:2000]
    for kind in KINDS:
        if kind not in found:
            result[kind] = None
            continue
        _, heading, body = found[kind]
        lines = [norm(x) for x in body if norm(x)]
        result[kind] = {'heading': text(heading).strip()[:60] if heading is not None else 'Opening profile (no heading)', 'paragraphs': lines[:40],
                        'bullets': sum(1 for x in body if text(x).strip() and is_bullet(x)),
                        'supported': 0 < len(lines) <= 40}
    place, roles = experience_roles(root)
    result['experience'] = None if place is None else {
        'heading': text(place[1]).strip()[:60],
        'roles': [{'title': role_title(r), 'bullets': [norm(b) for b in r['bullets']][:MAX_LINES]} for r in roles],
        'supported': bool(roles) and all(len(r['bullets']) <= MAX_LINES for r in roles)}
    return result


def new_paragraph(template, line):
    p = ET.Element(q('p'))
    ppr = template.find(q('pPr'))
    if ppr is not None:
        ppr = copy.deepcopy(ppr)
        for s in ppr.findall(q('sectPr')):
            ppr.remove(s)
        p.append(ppr)
    run = ET.SubElement(p, q('r'))
    runs = [r for r in template.iter(q('r')) if r.find(q('t')) is not None]
    first = max(runs, key=lambda r: len(text(r)), default=None)
    if first is not None and first.find(q('rPr')) is not None:
        run.append(copy.deepcopy(first.find(q('rPr'))))
    t = ET.SubElement(run, q('t'), {XML_SPACE: 'preserve'})
    t.text = line
    return p


def clean_lines(lines, code, limit=MAX_LINE):
    need(isinstance(lines, list) and 0 < len(lines) <= MAX_LINES, code)
    out = []
    for line in lines:
        need(isinstance(line, str), code)
        line = re.sub(r'\s+', ' ', line).strip()
        need(0 < len(line) <= limit and not re.search(r'[\x00-\x08\x0b\x0c\x0e-\x1f\ud800-\udfff]', line), code)
        out.append(line)
    return out


def replace(container, body, lines, bullets):
    filled = [x for x in body if text(x).strip()]
    need(0 < len(filled) <= 40, 'CV_SECTION_LAYOUT_UNSUPPORTED')
    kids = list(container)
    first, last = kids.index(filled[0]), kids.index(filled[-1])
    span = [x for x in kids[first:last + 1] if x in body]
    need(not any(x.find(q('pPr') + '/' + q('sectPr')) is not None for x in span), 'CV_SECTION_BREAK_INSIDE')
    template = next((x for x in filled if is_bullet(x)), filled[0]) if bullets else filled[0]
    # Unchanged lines keep their original paragraph, so inline bold, highlights and links survive a reorder.
    originals = {}
    for x in filled:
        originals.setdefault(re.sub(r'\s+', ' ', text(x)).strip(), x)
    for x in span:
        container.remove(x)
    inserted = []
    for i, line in enumerate(lines):
        kept = originals.pop(line, None)
        inserted.append(kept if kept is not None else new_paragraph(template, line))
        container.insert(first + i, inserted[-1])
    return inserted


def namespaces(raw):
    found = []
    for _, (prefix, uri) in ET.iterparse(io.BytesIO(raw), events=['start-ns']):
        if (prefix, uri) not in found:
            found.append((prefix, uri))
    return found


def serialise(root, raw):
    declared = namespaces(raw)
    for prefix, uri in declared:
        try:
            ET.register_namespace(prefix, uri)
        except ValueError:
            pass
    out = ET.tostring(root, encoding='UTF-8', xml_declaration=True)
    start = out.index(b'<', out.index(b'?>') + 2)
    end = out.index(b'>', start)
    tag = out[start:end]
    extra = b''.join(b' xmlns:' + p.encode() + b'="' + u.encode() + b'"' for p, u in declared
                     if p and (b' xmlns:' + p.encode() + b'=') not in tag)
    return out[:end] + extra + out[end:]


def tailor(data, profile, achievements=None, profile_heading='', achievements_heading='', roles=None):
    """Replaces the profile, and optionally the Key achievements section and each employer's bullets (same employers, same order)."""
    set_chosen(profile_heading, achievements_heading)
    profile = clean_lines(profile, 'CV_PROFILE_INVALID', MAX_PROFILE_LINE)
    achievements = None if achievements is None else clean_lines(achievements, 'CV_ACHIEVEMENTS_INVALID')
    if roles is not None:
        need(isinstance(roles, list) and 0 < len(roles) <= MAX_ROLES, 'CV_ROLES_INVALID')
        roles = [clean_lines(r, 'CV_ROLES_INVALID') for r in roles]
    need(achievements is not None or roles is not None, 'CV_NOTHING_TO_TAILOR')
    z, _ = package(data)
    with z:
        raw = z.read('word/document.xml')
        root = xml(raw)
        found = locate(root)
        need('profile' in found and (achievements is None or 'achievements' in found), 'CV_SECTIONS_NOT_FOUND')
        if roles is not None:
            place, existing = experience_roles(root)
            need(place is not None and len(existing) == len(roles), 'CV_ROLES_CHANGED')
            for role, lines in zip(existing, roles):
                replace(place[0], role['bullets'], lines, True)
        new_profile = replace(found['profile'][0], found['profile'][2], profile, False)
        if achievements is not None:
            replace(found['achievements'][0], found['achievements'][2], achievements, True)
        # An untitled profile is re-checked by position, because a short new profile may not look like one.
        untitled = found['profile'][1] is None
        profile_at = list(root.iter(q('p'))).index(new_profile[0])
        document = serialise(root, raw)
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as out:
            for item in z.infolist():
                out.writestr(item, document if item.filename == 'word/document.xml' else z.read(item.filename),
                             compress_type=zipfile.ZIP_DEFLATED)
    result = buffer.getvalue()
    z2, root2 = package(result)
    z2.close()
    check = describe(result, profile_heading, achievements_heading)
    if untitled:
        need([norm(x) for x in list(root2.iter(q('p')))[profile_at:profile_at + len(profile)]] == profile, 'CV_TAILOR_VERIFY_FAILED')
    else:
        need(check['profile'] and check['profile']['paragraphs'] == profile, 'CV_TAILOR_VERIFY_FAILED')
    need(achievements is None or (check['achievements'] and check['achievements']['paragraphs'] == achievements), 'CV_TAILOR_VERIFY_FAILED')
    need(roles is None or (check['experience'] and [r['bullets'] for r in check['experience']['roles']] == roles), 'CV_TAILOR_VERIFY_FAILED')
    return result
