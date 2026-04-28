#!/bin/bash
cd "$(dirname "$0")"
export PATH="./node_modules/.bin:$PATH"
echo "Using local electron from: $(which electron)"
SHOW_WINDOW_ON_START=true ELECTRON_ENABLE_LOGGING=1 ./node_modules/.bin/electron .
