#!/bin/bash

# Încarcă variabilele din .env dacă există
if [ -f .env ]; then
    export $(cat .env | xargs)
fi

# Execută publicarea cu zapstore CLI
zapstore publish "$@"
