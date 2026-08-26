# Exports a .blend to GLB with web-sane settings.
#
# Run:
#   blender -b YOURFILE.blend --python tools/blender_export.py -- OUT.glb [decimate]
#
#   OUT.glb    where to write
#   decimate   optional 0.0-1.0 ratio. 0.3 keeps ~30% of triangles.
#              Omit or use 0 to export at full density.
#
# Cameras and lights are dropped — the website does its own lighting.

import bpy, sys, os

argv = sys.argv
argv = argv[argv.index("--") + 1:] if "--" in argv else []

# Refuse to export silently when linked assets are absent: their geometry is
# not in this file, so they would vanish from the GLB without any error.
missing = [l.filepath for l in bpy.data.libraries
           if not os.path.exists(bpy.path.abspath(l.filepath))]
if missing:
    print("\n" + "!" * 70)
    print(f"WARNING: {len(missing)} linked librarie(s) are missing.")
    print("Anything they provided will NOT be in the exported GLB.")
    for p in missing[:10]:
        print("   x  " + p)
    if len(missing) > 10:
        print(f"   ... and {len(missing) - 10} more")
    print("Exporting anyway with whatever is local to this file.")
    print("!" * 70 + "\n")

out = argv[0] if argv else "/tmp/plaza.glb"
decimate = float(argv[1]) if len(argv) > 1 else 0.0

scene = bpy.context.scene

# Drop cameras and lights.
for ob in list(scene.objects):
    if ob.type in {"CAMERA", "LIGHT"}:
        bpy.data.objects.remove(ob, do_unlink=True)

# Make sure nothing is hidden from the exporter for the wrong reason.
for ob in scene.objects:
    ob.hide_viewport = False

if decimate > 0:
    n = 0
    for ob in scene.objects:
        if ob.type == "MESH" and len(ob.data.polygons) > 500:
            m = ob.modifiers.new("web_decimate", "DECIMATE")
            m.decimate_type = "COLLAPSE"
            m.ratio = decimate
            n += 1
    print(f"[export] decimate {decimate} applied to {n} objects")

# Blender renames exporter kwargs between versions, so pass what exists.
opts = dict(
    filepath=out,
    export_format="GLB",
    export_apply=True,          # bake modifiers into the mesh
    export_yup=True,
    export_cameras=False,
    export_lights=False,
    export_extras=False,
)

sig = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
opts = {k: v for k, v in opts.items() if k in sig}

print(f"[export] writing {out}")
bpy.ops.export_scene.gltf(**opts)
print("[export] done")
