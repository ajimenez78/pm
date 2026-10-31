#!/bin/sh
set -eu

CONTAINER_NAME=pm-mvp
EXISTING_CONTAINER=$(docker container ls --all \
    --filter "name=^/${CONTAINER_NAME}$" \
    --format '{{.Names}}')

if [ "$EXISTING_CONTAINER" != "$CONTAINER_NAME" ]; then
    printf 'Container %s does not exist.\n' "$CONTAINER_NAME"
    exit 0
fi

IS_RUNNING=$(docker container inspect \
    --format '{{.State.Running}}' "$CONTAINER_NAME")

if [ "$IS_RUNNING" = "true" ]; then
    docker container stop "$CONTAINER_NAME"
else
    printf 'Container %s is already stopped.\n' "$CONTAINER_NAME"
fi
