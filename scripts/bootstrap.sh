#!/usr/bin/env bash
set -euo pipefail

PACKAGE="github:MotionWriter/notion-tiller-portal-public#main"
NTN_INSTALL_DIR="${NTN_INSTALL_DIR:-$HOME/.local/bin}"

echo "Notion Tiller Portal bootstrap"
echo
echo "This gets your terminal ready, then starts the guided installer."
echo "Daily render work happens in Notion after setup."
echo

need_cmd() {
	if ! command -v "$1" >/dev/null 2>&1; then
		return 1
	fi
}

node_major() {
	node --version 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/'
}

if ! need_cmd node || ! need_cmd npm; then
	echo "Node.js and npm are required."
	echo "Install Node.js 22+ from https://nodejs.org, then rerun this command."
	echo
	echo "Copy/paste option:"
	if [[ "$(uname -s)" == "Darwin" ]]; then
		echo "  brew install node@22"
		echo "  export PATH=\"/opt/homebrew/opt/node@22/bin:\$PATH\""
	else
		echo "  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -"
		echo "  sudo apt-get install -y nodejs"
	fi
	exit 1
fi

NODE_MAJOR="$(node_major)"
if [ -z "$NODE_MAJOR" ] || [ "$NODE_MAJOR" -lt 22 ]; then
	echo "Node.js 22+ is required. Found: $(node --version)"
	echo "Update Node.js from https://nodejs.org, then rerun this command."
	echo
	echo "Copy/paste option:"
	if [[ "$(uname -s)" == "Darwin" ]]; then
		echo "  brew install node@22"
		echo "  export PATH=\"/opt/homebrew/opt/node@22/bin:\$PATH\""
	else
		echo "  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -"
		echo "  sudo apt-get install -y nodejs"
	fi
	exit 1
fi

echo "node: $(node --version)"
echo "npm: $(npm --version)"

mkdir -p "$NTN_INSTALL_DIR"
export PATH="$NTN_INSTALL_DIR:$PATH"

if ! need_cmd ntn; then
	echo
	echo "Installing Notion CLI to $NTN_INSTALL_DIR..."
	curl -fsSL "https://ntn.dev" | NTN_INSTALL_DIR="$NTN_INSTALL_DIR" bash
	export PATH="$NTN_INSTALL_DIR:$PATH"
fi

echo "ntn: $(ntn --version)"

echo
echo "Checking Notion CLI login..."
if ! ntn api v1/users/me >/dev/null 2>&1; then
	ntn login
fi

echo
npm exec --yes --package="$PACKAGE" -- notion-tiller-portal onboarding

echo
read -r -p "Start installer now? [Y/n] " START_INSTALL
if [[ "$START_INSTALL" =~ ^[Nn] ]]; then
	echo "Stopped before install. Rerun this script when ready."
	exit 0
fi

npm exec --yes --package="$PACKAGE" -- notion-tiller-portal install
