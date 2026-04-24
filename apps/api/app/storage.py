import json
import math
import os
import shutil
import struct
from pathlib import Path
from typing import Any


def get_repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def get_data_dir() -> Path:
    raw = os.getenv("TOPOLOG_DATA_DIR")
    if raw:
        return Path(raw).expanduser().resolve()
    return get_repo_root() / ".topolog-data"


def get_jobs_dir() -> Path:
    return get_data_dir() / "jobs"


def job_workdir(job_id: str) -> Path:
    return get_jobs_dir() / job_id


def ensure_job_workdir(job_id: str) -> Path:
    workdir = job_workdir(job_id)
    for relative in (
        "input",
        "frames",
        "poses/colmap",
        "splats/checkpoints",
        "mesh",
        "sim",
        "manifests",
        "logs",
    ):
        (workdir / relative).mkdir(parents=True, exist_ok=True)
    return workdir


def input_file_path(job_id: str, filename: str) -> Path:
    safe_name = Path(filename).name
    return ensure_job_workdir(job_id) / "input" / safe_name


def save_input_file(job_id: str, filename: str, content: bytes | None) -> Path:
    path = input_file_path(job_id, filename)
    path.write_bytes(content or b"")
    return path


def copy_input_file(src_job_id: str, dest_job_id: str, filename: str) -> Path:
    src = input_file_path(src_job_id, filename)
    dest = input_file_path(dest_job_id, filename)
    if src.exists():
        shutil.copy2(src, dest)
    else:
        dest.write_bytes(b"")
    return dest


def manifest_dir(job_id: str) -> Path:
    return ensure_job_workdir(job_id) / "manifests"


def stage_manifest_path(job_id: str, stage_name: str) -> Path:
    return manifest_dir(job_id) / f"{stage_name}.json"


def stage_log_path(job_id: str, stage_name: str) -> Path:
    return ensure_job_workdir(job_id) / "logs" / f"{stage_name}.log"


def scene_bundle_manifest_path(job_id: str) -> Path:
    return ensure_job_workdir(job_id) / "manifest.json"


def write_json(path: Path, payload: Any) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    if hasattr(payload, "model_dump"):
        data = payload.model_dump(mode="json")
    else:
        data = payload
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")
    return path


def write_text(path: Path, content: str) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    return path


def write_bytes(path: Path, content: bytes) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)
    return path


def artifact_storage_path(job_id: str, fmt: str) -> Path:
    upper = fmt.upper()
    workdir = ensure_job_workdir(job_id)
    if upper == "PLY":
        return workdir / "splats" / "results" / "plys" / "point_cloud.ply"
    if upper == "GLB":
        return workdir / "mesh" / "scene.glb"
    if upper == "MJCF":
        return workdir / "sim" / "scene.xml"
    if upper == "MP4":
        return workdir / "sim" / "stability.mp4"
    raise ValueError(f"Unsupported artifact format: {fmt}")


def _build_demo_glb() -> bytes:
    """Build a compact low-poly mesh for fake-mode simulation exports."""
    rings = 18
    steps = 48
    positions_3d = tuple(
        (
            0.62
            * math.cos(-math.pi / 2 + math.pi * ring_i / (rings - 1))
            * math.cos(2 * math.pi * step_i / steps)
            * (1 + 0.05 * math.sin(step_i * 0.31)),
            -0.08 + 0.74 * math.sin(-math.pi / 2 + math.pi * ring_i / (rings - 1)),
            0.06
            + 0.44
            * math.cos(-math.pi / 2 + math.pi * ring_i / (rings - 1))
            * math.sin(2 * math.pi * step_i / steps),
        )
        for ring_i in range(rings)
        for step_i in range(steps)
    )
    positions = tuple(value for point in positions_3d for value in point)
    indices = tuple(
        index
        for ring_i in range(rings - 1)
        for step_i in range(steps)
        for index in (
            ring_i * steps + step_i,
            ring_i * steps + (step_i + 1) % steps,
            (ring_i + 1) * steps + step_i,
            ring_i * steps + (step_i + 1) % steps,
            (ring_i + 1) * steps + (step_i + 1) % steps,
            (ring_i + 1) * steps + step_i,
        )
    )
    pos_bytes = struct.pack(f"<{len(positions)}f", *positions)
    idx_bytes = struct.pack(f"<{len(indices)}H", *indices)
    x_values = tuple(point[0] for point in positions_3d)
    y_values = tuple(point[1] for point in positions_3d)
    z_values = tuple(point[2] for point in positions_3d)

    buffer_body = pos_bytes + idx_bytes
    buf_len = len(buffer_body)
    buffer_data = buffer_body + (b"\x00" * ((4 - buf_len % 4) % 4))

    json_str = json.dumps(
        {
            "asset": {"version": "2.0", "generator": "topolog-fake"},
            "scene": 0,
            "scenes": [{"nodes": [0]}],
            "nodes": [{"mesh": 0}],
            "meshes": [
                {
                    "primitives": [
                        {
                            "attributes": {"POSITION": 1},
                            "indices": 0,
                            "mode": 4,
                            "material": 0,
                        }
                    ]
                }
            ],
            "materials": [
                {
                    "pbrMetallicRoughness": {
                        "baseColorFactor": [0.36, 0.48, 0.76, 1.0],
                        "metallicFactor": 0.0,
                        "roughnessFactor": 0.72,
                    }
                }
            ],
            "accessors": [
                {
                    "bufferView": 1,
                    "componentType": 5123,
                    "count": len(indices),
                    "type": "SCALAR",
                    "max": [max(indices)],
                    "min": [min(indices)],
                },
                {
                    "bufferView": 0,
                    "componentType": 5126,
                    "count": len(positions_3d),
                    "type": "VEC3",
                    "max": [max(x_values), max(y_values), max(z_values)],
                    "min": [min(x_values), min(y_values), min(z_values)],
                },
            ],
            "bufferViews": [
                {
                    "buffer": 0,
                    "byteOffset": 0,
                    "byteLength": len(pos_bytes),
                    "target": 34962,
                },
                {
                    "buffer": 0,
                    "byteOffset": len(pos_bytes),
                    "byteLength": len(idx_bytes),
                    "target": 34963,
                },
            ],
            "buffers": [{"byteLength": buf_len}],
        },
        separators=(",", ":"),
    )
    raw_json_bytes = json_str.encode("utf-8")
    json_bytes = raw_json_bytes + (b" " * ((4 - len(raw_json_bytes) % 4) % 4))

    total = 12 + (8 + len(json_bytes)) + (8 + len(buffer_data))
    header = struct.pack("<4sII", b"glTF", 2, total)
    json_chunk = struct.pack("<I4s", len(json_bytes), b"JSON") + json_bytes
    bin_chunk = struct.pack("<I4s", len(buffer_data), b"BIN\x00") + buffer_data
    return header + json_chunk + bin_chunk


def _build_demo_splat_ply() -> bytes:
    """Build a dense binary PLY compatible with the Spark splat viewer."""
    fields = [
        "x",
        "y",
        "z",
        "scale_0",
        "scale_1",
        "scale_2",
        "rot_0",
        "rot_1",
        "rot_2",
        "rot_3",
        "opacity",
        "f_dc_0",
        "f_dc_1",
        "f_dc_2",
    ]
    floor_x = 46
    floor_z = 30
    body_rings = 15
    body_steps = 128
    wall_x = 34
    wall_y = 16
    floor_points = tuple(
        (
            (x_i / (floor_x - 1) - 0.5) * 3.0,
            -0.74 + 0.012 * math.sin(x_i * 0.7 + z_i * 0.35),
            (z_i / (floor_z - 1) - 0.5) * 1.9,
            0.028,
            1.35,
            0.15 + 0.08 * (x_i / (floor_x - 1)),
            0.20 + 0.08 * (z_i / (floor_z - 1)),
            0.28 + 0.12 * (x_i / (floor_x - 1)),
        )
        for z_i in range(floor_z)
        for x_i in range(floor_x)
    )
    body_points = tuple(
        (
            0.58
            * math.cos(-math.pi / 2 + math.pi * ring_i / (body_rings - 1))
            * math.cos(2 * math.pi * step_i / body_steps)
            * (1 + 0.05 * math.sin(step_i * 0.31)),
            -0.08
            + 0.72 * math.sin(-math.pi / 2 + math.pi * ring_i / (body_rings - 1)),
            0.06
            + 0.42
            * math.cos(-math.pi / 2 + math.pi * ring_i / (body_rings - 1))
            * math.sin(2 * math.pi * step_i / body_steps),
            0.043 + 0.012 * (1 - abs(ring_i / (body_rings - 1) - 0.5) * 2),
            3.6,
            0.50 + 0.12 * math.sin(step_i * 0.05),
            0.57 + 0.12 * (ring_i / (body_rings - 1)),
            0.72 - 0.08 * (ring_i / (body_rings - 1)),
        )
        for ring_i in range(body_rings)
        for step_i in range(body_steps)
    )
    wall_points = tuple(
        (
            (x_i / (wall_x - 1) - 0.5) * 3.0,
            -0.54 + y_i / (wall_y - 1) * 1.45,
            -1.03,
            0.026,
            0.95,
            0.09 + 0.08 * (y_i / (wall_y - 1)),
            0.12 + 0.10 * (x_i / (wall_x - 1)),
            0.20 + 0.18 * (y_i / (wall_y - 1)),
        )
        for y_i in range(wall_y)
        for x_i in range(wall_x)
    )
    points = floor_points + body_points + wall_points
    sh_c0 = 0.28209479177387814

    header = [
        "ply",
        "format binary_little_endian 1.0",
        f"element vertex {len(points)}",
        *[f"property float {field}" for field in fields],
        "end_header",
        "",
    ]
    def pack_point(point: tuple[float, float, float, float, float, float, float, float]) -> bytes:
        x, y, z, radius, opacity, r, g, b = point
        scale = math.log(radius)
        return struct.pack(
            "<14f",
            x,
            y,
            z,
            scale,
            scale,
            scale,
            1.0,
            0.0,
            0.0,
            0.0,
            opacity,
            (r - 0.5) / sh_c0,
            (g - 0.5) / sh_c0,
            (b - 0.5) / sh_c0,
        )

    body = b"".join(pack_point(point) for point in points)
    return "\n".join(header).encode("ascii") + body


def ensure_fake_stage_outputs(job_id: str) -> None:
    workdir = ensure_job_workdir(job_id)
    write_text(
        workdir / "poses" / "colmap" / "sparse.txt", "fake colmap sparse output\n"
    )
    write_bytes(
        workdir / "splats" / "results" / "plys" / "point_cloud.ply",
        _build_demo_splat_ply(),
    )
    write_bytes(
        workdir / "splats" / "results" / "ckpts" / "ckpt_final.pt", b"fake-checkpoint"
    )
    write_text(
        workdir / "mesh" / "scene.obj",
        "o scene\nv 0 0 0\nv 1 0 0\nv 0 1 0\nv 0 0 1\nv 1 0 1\nv 0.5 1 1\nf 1 2 3\nf 4 5 6\n",
    )
    write_bytes(workdir / "mesh" / "scene.glb", _build_demo_glb())
    write_text(
        workdir / "sim" / "scene.xml", '<mujoco model="scene"><worldbody /></mujoco>\n'
    )
    write_json(
        workdir / "sim" / "validation.json",
        {
            "mujocoLoadSuccess": True,
            "simulationStable": None,
            "nbody": None,
            "ngeom": None,
        },
    )


def remove_job_workdir(job_id: str) -> None:
    shutil.rmtree(job_workdir(job_id), ignore_errors=True)
