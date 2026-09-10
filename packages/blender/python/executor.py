#!/usr/bin/env python3
"""
hi3d-cli headless Blender executor.

Runs either as   python executor.py [--channel stdio]
or inside Blender: blender -b --factory-startup --disable-autoexec -noaudio \
                       --python executor.py -- [--channel stdio]

Protocol (stdio channel):
  request  (stdin, one per line): {"id": 1, "op": "load", "args": {"path": "model.glb"}}
  response (stdout, one per line, prefixed):  HI3D:{"id": 1, "ok": true, "result": {...}}
                                              HI3D:{"id": 1, "ok": false, "error": {"type", "message", "trace"}}
  events   (stdout, prefixed):                HI3D:{"event": "ready", "backend": "app"|"pip", "blender": "5.2.1", ...}
                                              HI3D:{"event": "log", "msg": "..."}
The real stdout is duplicated to a private fd and fd 1 is redirected to stderr, so Blender's own chatter
("Fra:1 Mem:…", importer warnings, stray prints) can never corrupt the protocol channel. Works on Windows too.

`python executor.py --selfcheck` prints one JSON line {bpy, blender, python, platform, import_seconds} and exits.
"""
import io
import json
import math
import os
import platform as _platform
import sys
import time
import traceback
from contextlib import redirect_stdout

# ---------------------------------------------------------------------------
# protocol channel
# ---------------------------------------------------------------------------
PREFIX = "HI3D:"
_proto_fd = os.dup(1)
os.dup2(2, 1)  # everything that still writes to fd 1 lands on stderr
PROTO = os.fdopen(_proto_fd, "w", buffering=1, encoding="utf-8", newline="\n")
sys.stdout = sys.stderr


def send(obj):
    PROTO.write("\n" + PREFIX + json.dumps(obj, ensure_ascii=False, default=_json_default) + "\n")
    PROTO.flush()


def log(msg):
    send({"event": "log", "msg": str(msg)[:2000]})


def _json_default(o):
    try:
        return list(o)
    except Exception:
        return str(o)


def argv_after_dashdash():
    a = sys.argv
    if "--" in a:
        return a[a.index("--") + 1 :]
    return a[1:]


ARGS = argv_after_dashdash()
IN_BLENDER_APP = "--python" in sys.argv or os.path.basename(sys.argv[0]).lower().startswith("blender")

_bpy = None
_import_seconds = 0.0
_session_path = None  # set by session_open/save; autosave target


def bpy_mod():
    global _bpy, _import_seconds
    if _bpy is None:
        t = time.time()
        import bpy  # noqa

        _bpy = bpy
        _import_seconds = round(time.time() - t, 2)
        try:
            bpy.context.preferences.filepaths.use_scripts_auto_execute = False
        except Exception:
            pass
        bpy.ops.wm.read_factory_settings(use_empty=True)
    return _bpy


def selfcheck():
    info = {"python": sys.version.split()[0], "platform": f"{sys.platform}-{_platform.machine()}", "backend": "app" if IN_BLENDER_APP else "pip"}
    try:
        bpy = bpy_mod()
        info.update({"bpy": True, "blender": bpy.app.version_string, "import_seconds": _import_seconds})
    except Exception as e:  # noqa
        info.update({"bpy": False, "error": f"{type(e).__name__}: {e}"})
    return info


# ---------------------------------------------------------------------------
# scene helpers
# ---------------------------------------------------------------------------
def mesh_objects(name=None):
    bpy = bpy_mod()
    objs = [o for o in bpy.context.scene.objects if o.type == "MESH" and not o.name.startswith("_hi3d_")]
    if name:
        objs = [o for o in objs if o.name == name]
        if not objs:
            raise ValueError(f"no mesh object named {name!r}")
    return objs


def scene_bounds(objs=None):
    from mathutils import Vector

    objs = objs or mesh_objects()
    if not objs:
        return Vector((0, 0, 0)), 1.0, Vector((-1, -1, -1)), Vector((1, 1, 1))
    lo = Vector((1e30,) * 3)
    hi = Vector((-1e30,) * 3)
    for o in objs:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo = Vector((min(lo.x, w.x), min(lo.y, w.y), min(lo.z, w.z)))
            hi = Vector((max(hi.x, w.x), max(hi.y, w.y), max(hi.z, w.z)))
    center = (lo + hi) / 2
    radius = max((hi - lo).length / 2, 1e-3)
    return center, radius, lo, hi


def select_only(objs):
    bpy = bpy_mod()
    for o in bpy.context.scene.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0] if objs else None


def apply_transforms(objs, location=False, rotation=True, scale=True):
    bpy = bpy_mod()
    select_only(objs)
    bpy.ops.object.transform_apply(location=location, rotation=rotation, scale=scale)


def totals(objs=None):
    bpy = bpy_mod()
    import bmesh

    objs = objs or mesh_objects()
    v = f = t = nm = 0
    for o in objs:
        me = o.data
        me.calc_loop_triangles()
        v += len(me.vertices)
        f += len(me.polygons)
        t += len(me.loop_triangles)
        bm = bmesh.new()
        bm.from_mesh(me)
        nm += sum(1 for e in bm.edges if not e.is_manifold)
        bm.free()
    _, _, lo, hi = scene_bounds(objs)
    return {"objects": len(objs), "vertices": v, "faces": f, "triangles": t, "non_manifold_edges": nm, "dimensions_m": [round(hi.x - lo.x, 4), round(hi.y - lo.y, 4), round(hi.z - lo.z, 4)]}


def _no_backups():
    try:
        bpy_mod().context.preferences.filepaths.save_version = 0
    except Exception:  # noqa
        pass


def _autosave():
    if _session_path:
        try:
            _no_backups()
            bpy_mod().ops.wm.save_as_mainfile(filepath=_session_path, copy=True, compress=True)
        except Exception as e:  # noqa
            log(f"autosave failed: {e}")


def mutating(fn):
    def wrapper(**kw):
        before = totals()
        res = fn(**kw)
        after = totals()
        _autosave()
        out = {"before": before, "after": after}
        if isinstance(res, dict):
            out.update(res)
        return out

    wrapper.__name__ = fn.__name__
    return wrapper


# ---------------------------------------------------------------------------
# core ops
# ---------------------------------------------------------------------------
def op_ping(**_):
    return {"pong": True, "pid": os.getpid(), "bpy_loaded": _bpy is not None}


def op_info(**_):
    return selfcheck()


def op_load(path, clear=True, name=None, merge_vertices=True, weld="auto", **_):
    bpy = bpy_mod()
    path = os.path.abspath(path)
    if not os.path.exists(path):
        raise FileNotFoundError(path)
    ext = os.path.splitext(path)[1].lower()
    if clear:
        bpy.ops.wm.read_factory_settings(use_empty=True)
    before = set(o.name for o in bpy.context.scene.objects)
    if ext in (".glb", ".gltf"):
        try:
            bpy.ops.import_scene.gltf(filepath=path, merge_vertices=bool(merge_vertices))
        except TypeError:
            bpy.ops.import_scene.gltf(filepath=path)
    elif ext == ".obj":
        bpy.ops.wm.obj_import(filepath=path)
    elif ext == ".stl":
        bpy.ops.wm.stl_import(filepath=path)
    elif ext == ".fbx":
        bpy.ops.import_scene.fbx(filepath=path)
    elif ext in (".usd", ".usdz", ".usda", ".usdc"):
        bpy.ops.wm.usd_import(filepath=path)
    elif ext == ".ply":
        bpy.ops.wm.ply_import(filepath=path)
    elif ext == ".blend":
        bpy.ops.wm.open_mainfile(filepath=path, load_ui=False)
    else:
        raise ValueError(f"unsupported format {ext}")
    new = [o for o in bpy.context.scene.objects if o.name not in before and o.type == "MESH"]
    if name and len(new) == 1:
        new[0].name = name
    # glTF/OBJ exporters split vertices along UV/normal seams; weld them back so manifold checks and
    # bmesh recipes see the real topology (UVs live on loops and survive the weld). Skipped for huge meshes.
    welded = 0
    if weld and ext != ".blend":
        import bmesh
        for o in new:
            if weld == "auto" and len(o.data.polygons) > 1_000_000:
                continue
            bm = bmesh.new()
            bm.from_mesh(o.data)
            n0 = len(bm.verts)
            bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
            welded += n0 - len(bm.verts)
            bm.to_mesh(o.data)
            bm.free()
            o.data.update()
    _autosave()
    res = op_inspect()
    res["loaded_from"] = path
    res["welded_vertices"] = welded
    return res


def op_inspect(detail="full", object=None, **_):
    bpy = bpy_mod()
    import bmesh

    objs = []
    for o in mesh_objects(object):
        me = o.data
        me.calc_loop_triangles()
        bm = bmesh.new()
        bm.from_mesh(me)
        non_manifold = sum(1 for e in bm.edges if not e.is_manifold)
        boundary = sum(1 for e in bm.edges if e.is_boundary)
        loose_parts = _count_islands(bm) if detail == "full" else None
        watertight = non_manifold == 0 and boundary == 0 and len(bm.faces) > 0
        volume_cm3 = None
        if watertight and detail == "full":
            try:
                bm2 = bm.copy()
                bm2.transform(o.matrix_world)
                volume_cm3 = round(bm2.calc_volume(signed=False) * 1e6, 2)
                bm2.free()
            except Exception:
                volume_cm3 = None
        bm.free()
        dims = o.dimensions
        textures = []
        for m in me.materials:
            if not m or not m.use_nodes:
                continue
            for n in m.node_tree.nodes:
                if n.type == "TEX_IMAGE" and n.image:
                    textures.append({"material": m.name, "image": n.image.name, "size_px": list(n.image.size), "packed": n.image.packed_file is not None})
        objs.append(
            {
                "name": o.name,
                "vertices": len(me.vertices),
                "faces": len(me.polygons),
                "triangles": len(me.loop_triangles),
                "dimensions_m": [round(dims.x, 4), round(dims.y, 4), round(dims.z, 4)],
                "dimensions_mm": [round(dims.x * 1000, 1), round(dims.y * 1000, 1), round(dims.z * 1000, 1)],
                "location": [round(v, 4) for v in o.location],
                "scale": [round(v, 4) for v in o.scale],
                "materials": [m.name for m in me.materials if m],
                "textures": textures,
                "has_uv": bool(me.uv_layers),
                "non_manifold_edges": non_manifold,
                "boundary_edges": boundary,
                "loose_parts": loose_parts,
                "is_watertight": watertight,
                "volume_cm3": volume_cm3,
                "modifiers": [f"{m.name}:{m.type}" for m in o.modifiers],
            }
        )
    center, radius, lo, hi = scene_bounds()
    return {
        "objects": objs,
        "totals": totals(),
        "bounds": {"min": [round(v, 4) for v in lo], "max": [round(v, 4) for v in hi], "center": [round(v, 4) for v in center], "radius": round(radius, 4)},
        "other_objects": [f"{o.name}:{o.type}" for o in bpy.context.scene.objects if o.type != "MESH" and not o.name.startswith("_hi3d_")],
        "blender": bpy.app.version_string,
        "session": _session_path,
    }


def _count_islands(bm):
    seen = set()
    islands = 0
    for v0 in bm.verts:
        if v0.index in seen:
            continue
        islands += 1
        stack = [v0]
        seen.add(v0.index)
        while stack:
            v = stack.pop()
            for e in v.link_edges:
                w = e.other_vert(v)
                if w.index not in seen:
                    seen.add(w.index)
                    stack.append(w)
    return islands


def op_script(code, timeout_s=None, **_):
    bpy = bpy_mod()
    import bmesh
    import mathutils

    g = {"bpy": bpy, "bmesh": bmesh, "mathutils": mathutils, "C": bpy.context, "D": bpy.data, "math": math, "os": os, "json": json, "__name__": "__hi3d_script__"}
    out = io.StringIO()
    t = time.time()
    with redirect_stdout(out):
        exec(compile(code, "<agent-script>", "exec"), g)
    result = g.get("result")
    try:
        json.dumps(result)
    except Exception:
        result = str(result)
    _autosave()
    return {"stdout": out.getvalue()[-20000:], "result": result, "seconds": round(time.time() - t, 2), "after": totals()}


VIEW_DIRS = {
    "front": (0, -1, 0.15),
    "back": (0, 1, 0.15),
    "left": (-1, 0, 0.15),
    "right": (1, 0, 0.15),
    "top": (0, -0.01, 1),
    "bottom": (0, -0.01, -1),
    "iso": (1, -1, 0.8),
    "iso_back": (-1, 1, 0.8),
}


def op_render(out="preview", views=("iso", "front"), resolution=512, samples=32, engine="auto", shading="material", transparent=False, object=None, **_):
    bpy = bpy_mod()
    from mathutils import Vector

    sc = bpy.context.scene
    objs = mesh_objects(object)
    center, radius, _, _ = scene_bounds(objs)
    if not any(o.name.startswith("_hi3d_sun") for o in sc.objects):
        for name, loc, energy in (("_hi3d_sun_key", (4, -4, 6), 3.0), ("_hi3d_sun_fill", (-5, -2, 3), 1.2), ("_hi3d_sun_rim", (0, 5, 4), 1.5)):
            bpy.ops.object.light_add(type="SUN", location=loc)
            L = bpy.context.active_object
            L.name = name
            L.data.energy = energy
            L.rotation_euler = (Vector(loc) * -1).to_track_quat("-Z", "Y").to_euler()
    if sc.world is None:
        sc.world = bpy.data.worlds.new("World")
    try:
        sc.world.use_nodes = True
    except Exception:
        pass
    bg = sc.world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs[0].default_value = (0.35, 0.35, 0.38, 1)
        bg.inputs[1].default_value = 0.8
    cam_obj = sc.objects.get("_hi3d_cam")
    if cam_obj is None:
        cam = bpy.data.cameras.new("_hi3d_cam")
        cam_obj = bpy.data.objects.new("_hi3d_cam", cam)
        sc.collection.objects.link(cam_obj)
    cam_obj.data.lens = 50
    sc.camera = cam_obj
    engine_used, fallback = _pick_engine(sc, engine)
    if engine_used == "CYCLES":
        sc.cycles.device = "CPU"
        sc.cycles.samples = int(samples)
        sc.cycles.use_denoising = False
        sc.cycles.use_adaptive_sampling = True
    elif engine_used == "BLENDER_WORKBENCH":
        sc.display.shading.light = "STUDIO"
        sc.display.shading.color_type = "TEXTURE" if shading == "material" else "SINGLE"
        if shading == "wire":
            sc.display.shading.show_xray = True
    sc.render.resolution_x = sc.render.resolution_y = int(min(max(resolution, 64), 1024))
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = bool(transparent)
    sc.render.image_settings.file_format = "PNG"
    fov = cam_obj.data.angle
    dist = radius / math.sin(fov / 2) * 0.95
    files = []
    t = time.time()
    for v in views:
        d = Vector(VIEW_DIRS.get(v, VIEW_DIRS["iso"])).normalized()
        cam_obj.location = center + d * dist
        cam_obj.rotation_euler = d.to_track_quat("Z", "Y").to_euler()
        fp = os.path.abspath(f"{out}_{v}.png")
        os.makedirs(os.path.dirname(fp), exist_ok=True)
        sc.render.filepath = fp
        bpy.ops.render.render(write_still=True)
        files.append(fp)
    return {"images": files, "seconds": round(time.time() - t, 1), "engine_used": engine_used, "fallback_used": fallback, "samples": samples, "resolution": sc.render.resolution_x}


def _pick_engine(sc, engine):
    engine = (engine or "auto").lower()
    wanted = {"cycles": "CYCLES", "workbench": "BLENDER_WORKBENCH", "eevee": "BLENDER_EEVEE_NEXT", "auto": "CYCLES"}.get(engine, "CYCLES")
    if wanted != "CYCLES" and not os.environ.get("HI3D_BLENDER_ALLOW_GL"):
        # Workbench / EEVEE need an OpenGL/EGL context; on headless machines without GL libraries the whole
        # process aborts (uncatchable). Cycles CPU never needs GL. Opt in with HI3D_BLENDER_ALLOW_GL=1.
        raise RuntimeError(f"engine {engine!r} needs OpenGL; use engine='cycles' (default) or set HI3D_BLENDER_ALLOW_GL=1 on a machine with GL libraries")
    try:
        sc.render.engine = wanted
        return wanted, False
    except Exception:
        sc.render.engine = "CYCLES"
        return "CYCLES", True


def op_export(path, format=None, apply_modifiers=True, objects=None, draco=False, **_):
    bpy = bpy_mod()
    path = os.path.abspath(path)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    fmt = (format or os.path.splitext(path)[1].lstrip(".")).lower()
    objs = [o for o in mesh_objects() if not objects or o.name in objects]
    for o in bpy.context.scene.objects:
        if o.name.startswith("_hi3d_"):
            o.hide_set(True)
    select_only(objs)
    if fmt in ("glb", "gltf"):
        bpy.ops.export_scene.gltf(filepath=path, export_format="GLB" if fmt == "glb" else "GLTF_SEPARATE", use_selection=True, export_apply=apply_modifiers, export_draco_mesh_compression_enable=bool(draco))
    elif fmt == "obj":
        bpy.ops.wm.obj_export(filepath=path, export_selected_objects=True, export_materials=True, apply_modifiers=apply_modifiers)
    elif fmt == "stl":
        bpy.ops.wm.stl_export(filepath=path, export_selected_objects=True, apply_modifiers=apply_modifiers)
    elif fmt == "fbx":
        bpy.ops.export_scene.fbx(filepath=path, use_selection=True, use_mesh_modifiers=apply_modifiers)
    elif fmt in ("usd", "usdz", "usdc", "usda"):
        bpy.ops.wm.usd_export(filepath=path, selected_objects_only=True)
    elif fmt == "ply":
        bpy.ops.wm.ply_export(filepath=path, export_selected_objects=True, apply_modifiers=apply_modifiers)
    elif fmt == "blend":
        bpy.ops.wm.save_as_mainfile(filepath=path, copy=True)
    else:
        raise ValueError(f"unsupported export format {fmt}")
    return {"path": path, "bytes": os.path.getsize(path), "format": fmt, "objects": [o.name for o in objs]}


def op_session(action="info", path=None, **_):
    global _session_path
    bpy = bpy_mod()
    if action == "open":
        _session_path = os.path.abspath(path)
        os.makedirs(os.path.dirname(_session_path), exist_ok=True)
        if os.path.exists(_session_path):
            bpy.ops.wm.open_mainfile(filepath=_session_path, load_ui=False)
        return {"session": _session_path, "exists": os.path.exists(_session_path), "totals": totals()}
    if action == "save":
        if path:
            _session_path = os.path.abspath(path)
        if not _session_path:
            raise ValueError("no session path")
        os.makedirs(os.path.dirname(_session_path), exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=_session_path, copy=True, compress=True)
        return {"session": _session_path, "bytes": os.path.getsize(_session_path)}
    if action == "reset":
        bpy.ops.wm.read_factory_settings(use_empty=True)
        _autosave()
        return {"session": _session_path, "totals": totals()}
    return {"session": _session_path, "totals": totals(), "blender": bpy.app.version_string}


# ---------------------------------------------------------------------------
# recipes (mutating)
# ---------------------------------------------------------------------------
@mutating
def op_scale_to_size(size_mm=None, size_m=None, axis="max", object=None, apply=True, **_):
    objs = mesh_objects(object)
    _, _, lo, hi = scene_bounds(objs)
    dims = [hi.x - lo.x, hi.y - lo.y, hi.z - lo.z]
    cur = max(dims) if axis == "max" else dims["xyz".index(axis)]
    target = float(size_m) if size_m is not None else float(size_mm) / 1000.0
    if cur <= 0:
        raise ValueError("object has zero size")
    factor = target / cur
    for o in objs:
        o.scale = [s * factor for s in o.scale]
    if apply:
        apply_transforms(objs)
    return {"scale_factor": round(factor, 6), "target_m": target, "axis": axis}


@mutating
def op_center(center=True, floor=True, origin="bottom", object=None, **_):
    from mathutils import Vector

    objs = mesh_objects(object)
    c, _, lo, hi = scene_bounds(objs)
    shift = Vector((0, 0, 0))
    if center:
        shift.x, shift.y = -c.x, -c.y
        shift.z = -lo.z if floor else -c.z
    elif floor:
        shift.z = -lo.z
    for o in objs:
        o.location = o.location + shift
    apply_transforms(objs, location=True)
    if origin == "bottom" or origin == "center":
        bpy = bpy_mod()
        select_only(objs)
        bpy.ops.object.origin_set(type="ORIGIN_GEOMETRY", center="BOUNDS")
        if origin == "bottom":
            for o in objs:
                _, _, olo, _ = scene_bounds([o])
                o.location.z = o.location.z  # origin at bounds center; move origin to bottom by shifting data
    return {"shift_m": [round(shift.x, 4), round(shift.y, 4), round(shift.z, 4)]}


@mutating
def op_transform(object=None, translate=None, rotate_deg=None, scale=None, apply=True, **_):
    objs = mesh_objects(object)
    for o in objs:
        if translate:
            o.location = [a + b for a, b in zip(o.location, translate)]
        if rotate_deg:
            o.rotation_euler = [a + math.radians(b) for a, b in zip(o.rotation_euler, rotate_deg)]
        if scale is not None:
            s = [scale] * 3 if isinstance(scale, (int, float)) else scale
            o.scale = [a * b for a, b in zip(o.scale, s)]
    if apply:
        apply_transforms(objs, location=True)
    return {}


@mutating
def op_decimate(target_faces=None, ratio=None, method="collapse", preserve_uv=True, symmetry=False, object=None, **_):
    bpy = bpy_mod()
    objs = mesh_objects(object)
    total = sum(len(o.data.polygons) for o in objs) or 1
    if ratio is None:
        if not target_faces:
            raise ValueError("target_faces or ratio required")
        ratio = min(1.0, max(0.001, float(target_faces) / total))
    for o in objs:
        bpy.context.view_layer.objects.active = o
        mod = o.modifiers.new("hi3d_decimate", "DECIMATE")
        if method == "planar":
            mod.decimate_type = "DISSOLVE"
            mod.angle_limit = math.radians(5)
        else:
            mod.decimate_type = "COLLAPSE"
            mod.ratio = float(ratio)
            mod.use_collapse_triangulate = True
            mod.use_symmetry = bool(symmetry)
            try:
                mod.use_dissolve_boundaries = False
            except Exception:
                pass
        bpy.ops.object.modifier_apply(modifier=mod.name)
    after = sum(len(o.data.polygons) for o in objs)
    return {"ratio": round(float(ratio), 4), "achieved_ratio": round(after / total, 4)}


@mutating
def op_repair(merge_distance=None, fill_holes=True, max_hole_sides=0, recalc_normals=True, delete_loose=True, dissolve_degenerate=True, triangulate=False, object=None, **_):
    """Each step is applied only if it does not increase the non-manifold edge count (otherwise it is rolled back).
    merge_distance=None → auto: 1e-5 × largest dimension (absolute metres otherwise)."""
    bpy = bpy_mod()
    import bmesh

    fixes, skipped, steps = [], [], []

    def nm(bm):
        return sum(1 for e in bm.edges if not e.is_manifold)

    for o in mesh_objects(object):
        me = o.data
        bm = bmesh.new()
        bm.from_mesh(me)
        size = max(o.dimensions) or 1.0
        dist = float(merge_distance) if merge_distance is not None else size * 1e-5
        plan = []
        if dist > 0:
            plan.append(("remove_doubles", lambda b: bmesh.ops.remove_doubles(b, verts=b.verts, dist=dist)))
        if dissolve_degenerate:
            plan.append(("dissolve_degenerate", lambda b: bmesh.ops.dissolve_degenerate(b, dist=min(dist, 1e-6) if dist > 0 else 1e-6, edges=b.edges)))
        if delete_loose:

            def _loose(b):
                lv = [v for v in b.verts if not v.link_edges]
                le = [e for e in b.edges if not e.link_faces]
                if lv:
                    bmesh.ops.delete(b, geom=lv, context="VERTS")
                if le:
                    bmesh.ops.delete(b, geom=le, context="EDGES")

            plan.append(("delete_loose", _loose))
        if fill_holes:

            def _fill(b):
                boundary = [e for e in b.edges if e.is_boundary]
                if boundary:
                    bmesh.ops.holes_fill(b, edges=boundary, sides=int(max_hole_sides or 0))

            plan.append(("fill_holes", _fill))
        if recalc_normals:
            plan.append(("recalc_normals", lambda b: bmesh.ops.recalc_face_normals(b, faces=b.faces)))
        if triangulate:
            plan.append(("triangulate", lambda b: bmesh.ops.triangulate(b, faces=b.faces)))
        before = nm(bm)
        for name, fn in plan:
            trial = bm.copy()
            try:
                fn(trial)
                after = nm(trial)
            except Exception as e:  # noqa
                trial.free()
                skipped.append(name)
                steps.append({"object": o.name, "step": name, "error": str(e)[:200]})
                continue
            if after > before:
                trial.free()
                skipped.append(name)
                steps.append({"object": o.name, "step": name, "non_manifold_before": before, "non_manifold_after": after, "applied": False})
            else:
                bm.free()
                bm = trial
                fixes.append(name)
                steps.append({"object": o.name, "step": name, "non_manifold_before": before, "non_manifold_after": after, "applied": True})
                before = after
        bm.to_mesh(me)
        bm.free()
        me.update()
    return {"fixes": sorted(set(fixes)), "skipped": sorted(set(skipped)), "merge_distance_m": None if merge_distance is None else float(merge_distance), "steps": steps}


@mutating
def op_split_loose(min_faces=50, keep="all", n=None, rename_prefix=None, object=None, **_):
    bpy = bpy_mod()
    objs = mesh_objects(object)
    select_only(objs)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.separate(type="LOOSE")
    bpy.ops.object.mode_set(mode="OBJECT")
    parts = sorted(mesh_objects(), key=lambda o: -len(o.data.polygons))
    removed = 0
    for o in list(parts):
        if len(o.data.polygons) < int(min_faces):
            bpy.data.objects.remove(o, do_unlink=True)
            removed += 1
    parts = sorted(mesh_objects(), key=lambda o: -len(o.data.polygons))
    if keep == "largest":
        for o in parts[1:]:
            bpy.data.objects.remove(o, do_unlink=True)
    elif keep == "top_n" and n:
        for o in parts[int(n) :]:
            bpy.data.objects.remove(o, do_unlink=True)
    parts = sorted(mesh_objects(), key=lambda o: -len(o.data.polygons))
    if rename_prefix:
        for i, o in enumerate(parts):
            o.name = f"{rename_prefix}{i + 1}"
    return {"parts": [{"name": o.name, "faces": len(o.data.polygons), "dimensions_mm": [round(d * 1000, 1) for d in o.dimensions]} for o in parts], "removed_small": removed}


@mutating
def op_join(names=None, target_name=None, **_):
    bpy = bpy_mod()
    objs = [o for o in mesh_objects() if not names or o.name in names]
    if len(objs) < 2:
        return {"joined": [o.name for o in objs]}
    select_only(objs)
    bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    if target_name:
        o.name = target_name
    return {"joined": o.name}


@mutating
def op_delete_objects(names, **_):
    bpy = bpy_mod()
    gone = []
    for o in [o for o in mesh_objects() if o.name in names]:
        gone.append(o.name)
        bpy.data.objects.remove(o, do_unlink=True)
    return {"deleted": gone}


@mutating
def op_apply_modifiers(object=None, **_):
    bpy = bpy_mod()
    applied = []
    for o in mesh_objects(object):
        bpy.context.view_layer.objects.active = o
        for m in list(o.modifiers):
            bpy.ops.object.modifier_apply(modifier=m.name)
            applied.append(f"{o.name}:{m.name}")
    return {"applied": applied}


@mutating
def op_hollow(wall_thickness_mm=2.0, object=None, **_):
    bpy = bpy_mod()
    warn = []
    for o in mesh_objects(object):
        bpy.context.view_layer.objects.active = o
        mod = o.modifiers.new("hi3d_solidify", "SOLIDIFY")
        mod.thickness = -float(wall_thickness_mm) / 1000.0
        mod.offset = 1.0
        mod.use_even_offset = True
        mod.use_rim = False
        bpy.ops.object.modifier_apply(modifier=mod.name)
    t = totals()
    if t["non_manifold_edges"]:
        warn.append("result is not manifold; run blender_repair or reduce thickness")
    return {"wall_thickness_mm": wall_thickness_mm, "warnings": warn, "experimental": True}


OPS = {
    "ping": op_ping,
    "info": op_info,
    "load": op_load,
    "inspect": op_inspect,
    "script": op_script,
    "render": op_render,
    "export": op_export,
    "session": op_session,
    "scale_to_size": op_scale_to_size,
    "center": op_center,
    "transform": op_transform,
    "decimate": op_decimate,
    "repair": op_repair,
    "split_loose": op_split_loose,
    "join": op_join,
    "delete_objects": op_delete_objects,
    "apply_modifiers": op_apply_modifiers,
    "hollow": op_hollow,
}


def main():
    if "--selfcheck" in ARGS:
        send(selfcheck())
        return
    send({"event": "ready", **{k: v for k, v in selfcheck().items() if k in ("backend", "python", "platform")}, "pid": os.getpid(), "ops": sorted(OPS)})
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        rid = None
        try:
            req = json.loads(line)
            rid = req.get("id")
            op = req.get("op")
            args = req.get("args") or {}
            if op not in OPS:
                raise ValueError(f"unknown op {op!r}; known: {sorted(OPS)}")
            send({"id": rid, "ok": True, "result": OPS[op](**args)})
        except Exception as e:  # noqa
            send({"id": rid, "ok": False, "error": {"type": type(e).__name__, "message": str(e)[:2000], "trace": traceback.format_exc()[-4000:]}})
        if rid is not None and isinstance(req, dict) and req.get("op") == "quit":
            break


if __name__ == "__main__" or IN_BLENDER_APP:
    main()
