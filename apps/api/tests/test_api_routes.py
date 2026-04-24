import time
from pathlib import Path
from urllib.parse import urlsplit

from conftest import fake_mp4


def wait_for_job_status(client, job_id: str, target_status: str, timeout: float = 2.0):
    start = time.monotonic()
    while time.monotonic() - start < timeout:
        response = client.get(f"/jobs/{job_id}")
        assert response.status_code == 200
        payload = response.json()
        if payload["status"] == target_status:
            return payload
        time.sleep(0.02)
    raise AssertionError(
        f"job {job_id} did not reach {target_status!r} within {timeout} seconds"
    )


def test_healthcheck(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_default_cors_allows_common_local_dev_origins(client):
    for origin in (
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
    ):
        response = client.options(
            "/jobs",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "POST",
            },
        )
        assert response.status_code == 200
        assert response.headers["access-control-allow-origin"] == origin


def test_list_jobs_returns_paginated_results(client):
    for i in range(3):
        client.post(
            "/jobs",
            json={
                "filename": f"list-{i}.mp4",
                "fileSize": 1000,
                "quality": "fast",
                "outputFormats": ["PLY"],
            },
        )

    response = client.get("/jobs")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] >= 3
    assert isinstance(data["jobs"], list)

    page = client.get("/jobs?offset=0&limit=2")
    assert page.status_code == 200
    assert len(page.json()["jobs"]) <= 2
    assert page.json()["total"] == data["total"]


def test_create_job_with_json_and_get_routes(client):
    response = client.post(
        "/jobs",
        json={
            "filename": "kitchen.mp4",
            "fileSize": 245000000,
            "quality": "balanced",
            "outputFormats": ["MJCF", "GLB", "PLY"],
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert "id" in payload
    assert "sceneId" in payload

    job_response = client.get(f"/jobs/{payload['id']}")
    assert job_response.status_code == 200
    job = job_response.json()
    assert job["filename"] == "kitchen.mp4"
    assert len(job["stages"]) == 5
    assert job["sceneId"] == payload["sceneId"]

    scene_response = client.get(f"/scenes/{payload['sceneId']}")
    assert scene_response.status_code == 200
    scene = scene_response.json()
    assert scene["displayName"] == "kitchen"
    assert scene["latestJobId"] == payload["id"]


def test_create_job_with_upload_persists_file_and_completes_pipeline(client):
    response = client.post(
        "/jobs",
        data={
            "filename": "office.mp4",
            "fileSize": "64",
            "quality": "fast",
            "outputFormats": "PLY,GLB,MJCF",
        },
        files={"file": ("office.mp4", fake_mp4(64), "video/mp4")},
    )
    assert response.status_code == 200
    payload = response.json()

    complete_job = wait_for_job_status(client, payload["id"], "complete")
    assert complete_job["completedAt"] is not None

    scenes_response = client.get("/scenes")
    assert scenes_response.status_code == 200
    scenes_payload = scenes_response.json()
    assert scenes_payload["total"] >= 1

    scene_response = client.get(f"/scenes/{payload['sceneId']}")
    assert scene_response.status_code == 200
    scene = scene_response.json()
    assert scene["latestJobStatus"] == "complete"
    assert scene["qualityMetrics"]["mjcfValid"] is True
    assert len(scene["artifacts"]) == 3

    first_artifact = scene["artifacts"][0]
    download_response = client.get(urlsplit(first_artifact["downloadUrl"]).path)
    assert download_response.status_code == 200


def test_stage_manifests_are_written(client):
    response = client.post(
        "/jobs",
        json={
            "filename": "manifests.mp4",
            "fileSize": 1000,
            "quality": "fast",
            "outputFormats": ["PLY"],
        },
    )
    payload = response.json()
    wait_for_job_status(client, payload["id"], "complete")

    workdir = Path(client.app.state.data_dir) / "jobs" / payload["id"]
    assert (workdir / "manifest.json").exists()
    assert (workdir / "manifests" / "pose_estimation.json").exists()
    assert (workdir / "manifests" / "gaussian_training.json").exists()
    assert (workdir / "manifests" / "mesh_extraction.json").exists()
    assert (workdir / "manifests" / "mjcf_preparation.json").exists()
    assert (workdir / "manifests" / "artifact_export.json").exists()


def test_rerun_scene_creates_new_job_and_bumps_version(client):
    create_response = client.post(
        "/jobs",
        json={
            "filename": "rerun.mp4",
            "fileSize": 5000,
            "quality": "balanced",
            "outputFormats": ["PLY"],
        },
    )
    create_payload = create_response.json()

    rerun_response = client.post(f"/scenes/{create_payload['sceneId']}/rerun")
    assert rerun_response.status_code == 200
    rerun_payload = rerun_response.json()
    assert rerun_payload["jobId"] != create_payload["id"]

    scene_response = client.get(f"/scenes/{create_payload['sceneId']}")
    assert scene_response.status_code == 200
    scene = scene_response.json()
    assert scene["latestVersion"] == 2
    assert scene["latestJobId"] == rerun_payload["jobId"]


def test_delete_scene_removes_scene_and_jobs(client):
    response = client.post(
        "/jobs",
        json={
            "filename": "delete_me.mp4",
            "fileSize": 1234,
            "quality": "fast",
            "outputFormats": ["PLY"],
        },
    )
    payload = response.json()

    delete_response = client.delete(f"/scenes/{payload['sceneId']}")
    assert delete_response.status_code == 204

    scene_response = client.get(f"/scenes/{payload['sceneId']}")
    assert scene_response.status_code == 404

    job_response = client.get(f"/jobs/{payload['id']}")
    assert job_response.status_code == 404


def test_cancel_job_stops_pipeline(client):
    response = client.post(
        "/jobs",
        json={
            "filename": "cancel_me.mp4",
            "fileSize": 1000,
            "quality": "fast",
            "outputFormats": ["PLY"],
        },
    )
    payload = response.json()

    cancel_response = client.post(f"/jobs/{payload['id']}/cancel")
    assert cancel_response.status_code == 200
    assert cancel_response.json()["status"] == "cancelled"

    job_response = client.get(f"/jobs/{payload['id']}")
    assert job_response.json()["status"] == "cancelled"


def test_cancel_nonexistent_job_returns_404(client):
    response = client.post("/jobs/does-not-exist/cancel")
    assert response.status_code == 404


def test_create_job_rejects_invalid_video_content(client):
    response = client.post(
        "/jobs",
        data={
            "filename": "not-a-video.mp4",
            "fileSize": "10",
            "quality": "fast",
            "outputFormats": "PLY",
        },
        files={"file": ("not-a-video.mp4", b"this is not a video file!", "video/mp4")},
    )
    assert response.status_code == 422
    assert "valid video" in response.json()["detail"]


def test_create_job_rejects_unsupported_file_type(client):
    response = client.post(
        "/jobs",
        json={
            "filename": "model.fbx",
            "fileSize": 1000,
            "quality": "fast",
            "outputFormats": ["PLY"],
        },
    )
    assert response.status_code == 422
    assert "Unsupported file type" in response.json()["detail"]


def test_create_job_rejects_oversized_upload(client):
    response = client.post(
        "/jobs",
        json={
            "filename": "huge.mp4",
            "fileSize": 3_000_000_000,
            "quality": "fast",
            "outputFormats": ["PLY"],
        },
    )
    assert response.status_code == 413
    assert "2 GB" in response.json()["detail"]


def test_get_job_returns_404_for_nonexistent(client):
    response = client.get("/jobs/does-not-exist")
    assert response.status_code == 404


def test_get_scene_returns_404_for_nonexistent(client):
    response = client.get("/scenes/does-not-exist")
    assert response.status_code == 404


def test_delete_nonexistent_scene_returns_204(client):
    response = client.delete("/scenes/does-not-exist")
    assert response.status_code == 204


def test_rerun_nonexistent_scene_returns_404(client):
    response = client.post("/scenes/does-not-exist/rerun")
    assert response.status_code == 404


def test_download_nonexistent_artifact_returns_404(client):
    response = client.get("/artifacts/does-not-exist")
    assert response.status_code == 404
