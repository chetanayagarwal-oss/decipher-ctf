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

import bpy, sys

argv = sys.argv
argv = argv[argv.index("--") + 1:] if "--" in argv else []

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
