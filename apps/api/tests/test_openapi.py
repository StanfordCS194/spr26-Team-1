"""Verify OpenAPI schema is valid, contains expected endpoints, and response shapes match contracts."""


def test_openapi_schema_loads(client):
    resp = client.get("/openapi.json")
    assert resp.status_code == 200
    schema = resp.json()

    assert schema["info"]["title"] == "Topolog API"
    assert schema["info"]["version"] == "0.1.0"


def test_openapi_has_all_endpoints(client):
    resp = client.get("/openapi.json")
    schema = resp.json()
    paths = set(schema["paths"].keys())

    expected = {
        "/health",
        "/jobs",
        "/jobs/{job_id}",
        "/jobs/{job_id}/cancel",
        "/scenes",
        "/scenes/{scene_id}",
        "/scenes/{scene_id}/rerun",
        "/artifacts/{artifact_id}",
    }

    missing = expected - paths
    assert not missing, f"OpenAPI schema missing endpoints: {missing}"


def test_openapi_job_response_has_required_fields(client):
    resp = client.get("/openapi.json")
    schema = resp.json()

    job_schema_name = "JobResponse"
    schemas = schema.get("components", {}).get("schemas", {})
    assert job_schema_name in schemas, f"Missing {job_schema_name} in OpenAPI components"

    job_schema = schemas[job_schema_name]
    props = set(job_schema.get("properties", {}).keys())
    required_fields = {"id", "filename", "fileSize", "quality", "status", "stages", "currentStageIndex", "createdAt"}
    missing = required_fields - props
    assert not missing, f"JobResponse schema missing fields: {missing}"


def test_openapi_scene_detail_has_required_fields(client):
    resp = client.get("/openapi.json")
    schema = resp.json()

    schemas = schema.get("components", {}).get("schemas", {})
    scene_schema_name = "SceneDetail"
    assert scene_schema_name in schemas, f"Missing {scene_schema_name} in OpenAPI components"

    scene_schema = schemas[scene_schema_name]
    props = set(scene_schema.get("properties", {}).keys())
    required_fields = {"sceneId", "displayName", "quality", "latestJobStatus", "artifacts", "createdAt"}
    missing = required_fields - props
    assert not missing, f"SceneDetail schema missing fields: {missing}"


def test_openapi_error_code_enum_matches_python(client):
    """Verify the OpenAPI schema includes the ErrorCode enum values."""
    from app.validators import ErrorCode

    resp = client.get("/openapi.json")
    schema = resp.json()
    schemas = schema.get("components", {}).get("schemas", {})

    job_schema = schemas.get("JobResponse", {})
    error_code_prop = job_schema.get("properties", {}).get("errorCode", {})

    if "anyOf" in error_code_prop:
        enum_ref = next(
            (ref for ref in error_code_prop["anyOf"] if "$ref" in ref or "enum" in ref),
            None,
        )
        if enum_ref and "$ref" in enum_ref:
            ref_name = enum_ref["$ref"].split("/")[-1]
            enum_schema = schemas.get(ref_name, {})
            openapi_values = set(enum_schema.get("enum", []))
            python_values = {e.value for e in ErrorCode}
            missing_in_openapi = python_values - openapi_values
            assert not missing_in_openapi, f"OpenAPI ErrorCode missing values: {missing_in_openapi}"


def test_openapi_scenes_delete_returns_204(client):
    resp = client.get("/openapi.json")
    schema = resp.json()
    delete_path = schema["paths"].get("/scenes/{scene_id}", {}).get("delete", {})
    assert delete_path, "DELETE /scenes/{scene_id} should exist"
    assert "204" in delete_path.get("responses", {}), "DELETE should return 204"
