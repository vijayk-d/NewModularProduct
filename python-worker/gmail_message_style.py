"""Local MIME presentation only: freeze the queued palette, never read live reviews."""
import re
THEME_MARKER='<!-- application-email-theme:v1 -->'
BACKGROUND='#f3f9ff'
PALETTE={'sky':'#f3f9ff','mint':'#f1faf4','lavender':'#f6f2fc','rose':'#fff3f5','ivory':'#fff8ec','white':'#ffffff'}
def email_background(theme=None):
    if theme is None:return BACKGROUND
    if not isinstance(theme,dict) or type(theme.get('version')) is not int or theme['version']!=1:
        raise ValueError('Invalid frozen email palette.')
    i=theme.get('id');c=theme.get('backgroundColor')
    if not isinstance(i,str) or i not in PALETTE or c!=PALETTE[i]:
        raise ValueError('Invalid frozen email palette.')
    return c
def style_email_body(body_html,theme=None):
    if not isinstance(body_html,str) or not body_html.strip():
        raise ValueError('A non-empty HTML email body is required.')
    color=email_background(theme)
    if body_html.startswith(THEME_MARKER):
        match=re.search(r'bgcolor=["\'](#[a-f0-9]{6})["\']',body_html,re.I)
        if not match or match.group(1).lower()!=color:
            raise ValueError('Prepared MIME background differs from frozen palette.')
        return body_html
    return (THEME_MARKER+'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="'+color+'" style="width:100%;background-color:'+color+';border-collapse:collapse;"><tbody><tr><td bgcolor="'+color+'" style="background-color:'+color+';color:#152033;padding:16px;">'+body_html+'</td></tr></tbody></table>')
