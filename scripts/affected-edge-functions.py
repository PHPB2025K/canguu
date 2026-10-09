#!/usr/bin/env python3
"""Resolve local imports so a new ML helper cannot redeploy unrelated channels."""
import pathlib, re, subprocess, sys
root = pathlib.Path('supabase/functions').resolve()
changed = {pathlib.Path(p).resolve() for p in subprocess.check_output(
    ['git', 'diff', '--name-only', sys.argv[1], sys.argv[2], '--', 'supabase/functions/'], text=True).splitlines()
    if not p.endswith(('.test.ts', '.md')) and '__benchmark__' not in p}
pattern = re.compile(r'''(?:from\s*|import\s*(?:\(\s*)?)["'](\.[^"']+)["']''')
def dependencies(path, seen):
    if path in seen: return
    seen.add(path)
    if not path.is_file(): return
    for rel in pattern.findall(path.read_text()):
        target = (path.parent / rel).resolve()
        if not target.suffix: target = target.with_suffix('.ts')
        if target.is_relative_to(root): dependencies(target, seen)
for directory in sorted(root.iterdir()):
    if not directory.is_dir() or directory.name.startswith('_'): continue
    seen = set(); dependencies(directory / 'index.ts', seen)
    if seen & changed or any(p.is_relative_to(directory) for p in changed): print(directory.name)
