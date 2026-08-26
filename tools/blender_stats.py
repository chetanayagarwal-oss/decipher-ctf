# Reports what's actually inside the .blend before we export anything.
# Run:  blender -b YOURFILE.blend --python tools/blender_stats.py
#
# Triangle counts are taken from the EVALUATED mesh, so subdivision and
# array modifiers are counted at their real cost — that is what ships.

import bpy, os

scene = bpy.context.scene

# ---------------------------------------------------------------- libraries
# Linked (not appended) assets live in OTHER .blend files. If those files are
# not on this machine, their geometry does not exist here and cannot export.
print("\n" + "=" * 74)
print("LINKED LIBRARIES")
print("=" * 74)
missing_libs, ok_libs = [], []
for lib in bpy.data.libraries:
    path = bpy.path.abspath(lib.filepath)
    (ok_libs if os.path.exists(path) else missing_libs).append(lib.filepath)

if not bpy.data.libraries:
    print("none - everything is local to this file. Good.")
else:
    print(f"found  : {len(ok_libs)}")
    print(f"MISSING: {len(missing_libs)}")
    for p in missing_libs[:25]:
        print(f"   x  {p}")
    if len(missing_libs) > 25:
        print(f"   ... and {len(missing_libs) - 25} more")

linked_objs = [o for o in scene.objects if o.library or
               (o.data and getattr(o.data, "library", None))]
print(f"\nobjects that come from a library: {len(linked_objs)}")

depsgraph = bpy.context.evaluated_depsgraph_get()

rows = []
total_eval = 0
total_base = 0

for ob in scene.objects:
    if ob.type != "MESH":
        continue
    base = len(ob.data.polygons)
    total_base += base
    try:
        ev = ob.evaluated_get(depsgraph)
        me = ev.to_mesh()
        me.calc_loop_triangles()
        tris = len(me.loop_triangles)
        ev.to_mesh_clear()
    except Exception:
        tris = base * 2
    total_eval += tris
    rows.append((tris, ob.name, [m.type for m in ob.modifiers]))

rows.sort(reverse=True)

print("\n" + "=" * 74)
print("MESH BUDGET")
print("=" * 74)
print(f"mesh objects        : {len(rows)}")
print(f"base faces          : {total_base:,}")
print(f"TRIANGLES (final)   : {total_eval:,}")
print("\nheaviest objects:")
for tris, name, mods in rows[:20]:
    m = (" mods:" + ",".join(mods)) if mods else ""
    print(f"  {tris:>12,}  {name}{m}")

print("\n" + "=" * 74)
print("TEXTURES")
print("=" * 74)
tex_px = 0
imgs = [i for i in bpy.data.images if i.size[0] and i.size[1]]
imgs.sort(key=lambda i: i.size[0] * i.size[1], reverse=True)
for img in imgs:
    w, h = img.size
    tex_px += w * h
    print(f"  {w:>5} x {h:<5}  packed={bool(img.packed_file)}  {img.name}")
print(f"\nimages              : {len(imgs)}")
print(f"total megapixels    : {tex_px / 1e6:.1f} MP")

print("\n" + "=" * 74)
print("MATERIALS / OBJECTS")
print("=" * 74)
print(f"materials           : {len(bpy.data.materials)}")
print(f"all objects         : {len(scene.objects)}")
print(f"cameras             : {len([o for o in scene.objects if o.type=='CAMERA'])}")
print(f"lights              : {len([o for o in scene.objects if o.type=='LIGHT'])}")

# Rough verdict so the numbers mean something.
print("\n" + "=" * 74)
print("VERDICT FOR WEB")
print("=" * 74)
if total_eval > 2_000_000:
    print("Triangles are FAR over web budget. Decimation is mandatory.")
elif total_eval > 500_000:
    print("Triangles are over a comfortable budget. Decimate before export.")
else:
    print("Triangle count is workable for the web.")
if tex_px / 1e6 > 100:
    print("Texture area is very large. Resize to 1-2K and convert to KTX2.")
print("Target for laptops: under ~500k triangles and under ~40 MP of texture.")
print("=" * 74 + "\n")
