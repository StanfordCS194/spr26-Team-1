# Topolog Dashboard

This branch is scoped to CS194 issue `#15`: a frontend dashboard wired to a backend API.

It includes:

- a Next.js dashboard for upload, job progress, library, and scene detail
- a FastAPI backend for jobs, scenes, and artifact downloads
- a fake async reconstruction pipeline that generates demo artifacts locally so the UI can be exercised end to end

It does not include live GPU execution, FarmShare, SLURM orchestration, or production reconstruction tooling.

## Workspace Layout

```text
.
├── apps
│   ├── api
│   │   ├── app
│   │   │   ├── main.py
│   │   │   ├── models.py
│   │   │   ├── pipeline.py
│   │   │   ├── routes/
│   │   │   ├── schemas.py
│   │   │   ├── services.py
│   │   │   ├── storage.py
│   │   │   └── validators.py
│   │   ├── tests/
│   │   └── pyproject.toml
│   └── web
│       ├── app/
│       ├── components/
│       ├── lib/
│       └── public/
├── packages
│   ├── contracts
│   └── sdk-ts
└── scripts
    └── bootstrap_api_env.sh
```

## API Surface

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | API + database health |
| `POST` | `/jobs` | Create a reconstruction job |
| `GET` | `/jobs` | List jobs |
| `GET` | `/jobs/{job_id}` | Job detail |
| `POST` | `/jobs/{job_id}/cancel` | Cancel queued or running work |
| `GET` | `/scenes` | Scene library |
| `GET` | `/scenes/{scene_id}` | Scene detail |
| `POST` | `/scenes/{scene_id}/rerun` | Start a new job for an existing scene |
| `DELETE` | `/scenes/{scene_id}` | Delete a scene and its jobs |
| `GET` | `/artifacts/{artifact_id}` | Download an artifact |

## Frontend Surface

- `Upload`: submit a video with quality and output selections
- `Library`: browse completed scenes
- `Job detail`: watch staged progress
- `Scene detail`: preview splat or mesh outputs and download artifacts

The frontend uses the real API when `NEXT_PUBLIC_TOPOLOG_API_BASE_URL` is set. Otherwise it falls back to the bundled demo client.

## Local Development

```bash
pnpm install
pnpm bootstrap:api
pnpm dev:api
pnpm dev
```

Create `apps/web/.env.local` with:

```bash
NEXT_PUBLIC_TOPOLOG_API_BASE_URL=http://127.0.0.1:8000
```

## Validation

```bash
pnpm test
pnpm build
```
