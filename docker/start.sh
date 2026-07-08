#!/bin/sh
set -e

node --use-system-ca dist/index.js &
exec nginx -g 'daemon off;'
