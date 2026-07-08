#!/bin/sh

node --use-system-ca dist/index.js &
sleep 2
exec nginx -g 'daemon off;'
