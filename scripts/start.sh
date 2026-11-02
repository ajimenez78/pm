#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
CONTAINER_NAME=pm-mvp
IMAGE_NAME=pm-mvp
DATA_VOLUME=pm-mvp-data

EXISTING_CONTAINER=$(docker container ls --all \
    --filter "name=^/${CONTAINER_NAME}$" \
    --format '{{.Names}}')

if [ "$EXISTING_CONTAINER" = "$CONTAINER_NAME" ]; then
    IS_RUNNING=$(docker container inspect \
        --format '{{.State.Running}}' "$CONTAINER_NAME")
    if [ "$IS_RUNNING" = "true" ]; then
        printf 'Container %s is already running.\n' "$CONTAINER_NAME"
        exit 0
    fi
fi

docker build --tag "$IMAGE_NAME" "$ROOT_DIR"

if [ "$EXISTING_CONTAINER" = "$CONTAINER_NAME" ]; then
    docker container rm "$CONTAINER_NAME"
fi

if [ -f "$ROOT_DIR/.env" ]; then
    docker run --detach \
        --name "$CONTAINER_NAME" \
        --publish 127.0.0.1:8000:8000 \
        --volume "$DATA_VOLUME:/app/data" \
        --env-file "$ROOT_DIR/.env" \
        "$IMAGE_NAME"
else
    docker run --detach \
        --name "$CONTAINER_NAME" \
        --publish 127.0.0.1:8000:8000 \
        --volume "$DATA_VOLUME:/app/data" \
        "$IMAGE_NAME"
fi
