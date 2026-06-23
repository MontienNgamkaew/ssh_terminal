#!/bin/bash
# Sets up ssh-terminal to auto-start on Linux (Chromebook Crostini)

SERVICE_DIR="$HOME/.config/systemd/user"
SERVICE_FILE="$SERVICE_DIR/ssh-terminal.service"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

mkdir -p "$SERVICE_DIR"

cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=SSH Terminal Web App
After=network.target

[Service]
Type=simple
WorkingDirectory=$SCRIPT_DIR
ExecStartPre=/bin/sh -c 'fuser -k 3000/tcp || true'
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=5
KillMode=control-group

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable ssh-terminal.service
systemctl --user start ssh-terminal.service
loginctl enable-linger "$USER"

echo "Done. SSH Terminal will auto-start at http://localhost:3000"
