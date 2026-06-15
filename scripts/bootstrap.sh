#!/usr/bin/env bash
set -euo pipefail

BOOTSTRAP_URL="${BOOTSTRAP_URL:-https://raw.githubusercontent.com/MotionWriter/notion-tiller-portal-public/main/scripts/bootstrap.sh}"

if [ -z "${BOOTSTRAP_REEXECED:-}" ] && [ ! -t 0 ] && [ -r /dev/tty ]; then
	tmp_script="$(mktemp)"
	curl -fsSL "$BOOTSTRAP_URL" > "$tmp_script"
	chmod +x "$tmp_script"
	BOOTSTRAP_REEXECED=1 exec bash "$tmp_script" "$@" < /dev/tty
fi

PACKAGE="github:MotionWriter/notion-tiller-portal-public#main"
NTN_INSTALL_DIR="${NTN_INSTALL_DIR:-$HOME/.local/bin}"

echo "Notion Tiller Portal bootstrap"
echo
echo "This gets your terminal ready, then starts the guided installer."
echo "Daily render work happens in Notion after setup."
echo

action_needed() {
	echo
	printf '\033[1;33m>>> ACTION NEEDED <<<\033[0m\n'
	printf '\033[1;33m%s\033[0m\n' "$1"
}

need_cmd() {
	if ! command -v "$1" >/dev/null 2>&1; then
		return 1
	fi
}

node_major() {
	node --version 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/'
}

npm_major() {
	npm --version 2>/dev/null | sed -E 's/^([0-9]+).*/\1/'
}

manual_node_help() {
	echo "Open this page to install Node.js 22+ LTS:"
	echo "  https://nodejs.org"
	echo
	echo "npm is included with Node.js."
	action_needed "After Node installs, do NOT run ntn login poll yet."
	echo "Close and reopen Terminal, then rerun this bootstrap command:"
	echo "  curl -fsSL https://raw.githubusercontent.com/MotionWriter/notion-tiller-portal-public/main/scripts/bootstrap.sh | bash"
}

manual_git_help() {
	echo "Open this page to install Git:"
	case "$(uname -s)" in
		Darwin)
			echo "  https://git-scm.com/download/mac"
			;;
		*)
			echo "  https://git-scm.com/downloads"
			;;
	esac
	echo
	echo "Git is required because npm fetches this installer from GitHub."
	action_needed "After Git installs, do NOT run ntn login poll yet."
	echo "Close and reopen Terminal, then rerun this bootstrap command:"
	echo "  curl -fsSL https://raw.githubusercontent.com/MotionWriter/notion-tiller-portal-public/main/scripts/bootstrap.sh | bash"
}

resolve_node_requirement() {
	local reason="$1"
	echo "$reason"
	echo
	echo "Node.js 22+ and npm are required to move forward."
	echo

	if [[ "$(uname -s)" == "Darwin" ]] && need_cmd brew; then
		echo "You can install Node.js from:"
		echo "  https://nodejs.org"
		echo
		read -r -p "Or install Node.js 22 now with Homebrew? [y/N] " answer
		if [[ "$answer" =~ ^([yY]|[yY][eE][sS])$ ]]; then
			echo
			echo "Installing Node.js 22 with Homebrew..."
			if brew install node@22; then
				echo
				echo "Node.js install finished."
				action_needed "Do NOT run ntn login poll yet."
				echo "Close and reopen Terminal, then rerun this bootstrap command:"
				echo "  curl -fsSL https://raw.githubusercontent.com/MotionWriter/notion-tiller-portal-public/main/scripts/bootstrap.sh | bash"
				return
			fi
			echo
			echo "Homebrew install did not complete successfully."
		fi
	elif [[ "$(uname -s)" == "Darwin" ]]; then
		echo "Homebrew was not found on this Mac."
	else
		echo "Automatic Node install is not enabled for this OS."
	fi

	manual_node_help
}

resolve_git_requirement() {
	echo "Git was not found on PATH."
	echo
	echo "Git is required because npm fetches this installer from GitHub."
	echo

	if [[ "$(uname -s)" == "Darwin" ]] && need_cmd brew; then
		echo "You can install Git from:"
		echo "  https://git-scm.com/download/mac"
		echo
		read -r -p "Or install Git now with Homebrew? [y/N] " answer
		if [[ "$answer" =~ ^([yY]|[yY][eE][sS])$ ]]; then
			echo
			echo "Installing Git with Homebrew..."
			if brew install git; then
				echo
				echo "Git install finished."
				action_needed "Do NOT run ntn login poll yet."
				echo "Close and reopen Terminal, then rerun this bootstrap command:"
				echo "  curl -fsSL https://raw.githubusercontent.com/MotionWriter/notion-tiller-portal-public/main/scripts/bootstrap.sh | bash"
				return
			fi
			echo
			echo "Homebrew install did not complete successfully."
		fi
	elif [[ "$(uname -s)" == "Darwin" ]]; then
		echo "Homebrew was not found on this Mac."
	else
		echo "Automatic Git install is not enabled for this OS."
	fi

	manual_git_help
}

if ! need_cmd node || ! need_cmd npm; then
	resolve_node_requirement "Node.js or npm was not found."
	exit 1
fi

NODE_MAJOR="$(node_major)"
if [ -z "$NODE_MAJOR" ] || [ "$NODE_MAJOR" -lt 22 ]; then
	resolve_node_requirement "Node.js 22+ is required. Found: $(node --version)"
	exit 1
fi

NPM_MAJOR="$(npm_major)"
if [ -z "$NPM_MAJOR" ] || [ "$NPM_MAJOR" -lt 10 ]; then
	resolve_node_requirement "npm 10+ is required. Found: $(npm --version)"
	exit 1
fi

echo "node: $(node --version)"
echo "npm: $(npm --version)"

if ! need_cmd git; then
	resolve_git_requirement
	exit 1
fi

echo "git: $(git --version)"

mkdir -p "$NTN_INSTALL_DIR"
export PATH="$NTN_INSTALL_DIR:$PATH"

if ! need_cmd ntn; then
	echo
	echo "Installing Notion CLI to $NTN_INSTALL_DIR..."
	curl -fsSL "https://ntn.dev" | NTN_INSTALL_DIR="$NTN_INSTALL_DIR" bash
	export PATH="$NTN_INSTALL_DIR:$PATH"
fi

NTN_CMD="$(command -v ntn || true)"
if [ -z "$NTN_CMD" ] && [ -x "$NTN_INSTALL_DIR/ntn" ]; then
	NTN_CMD="$NTN_INSTALL_DIR/ntn"
fi

if [ -z "$NTN_CMD" ]; then
	echo "Notion CLI installed, but ntn is not available in this Terminal session."
	action_needed "Close and reopen Terminal, then rerun this bootstrap command:"
	echo "  curl -fsSL https://raw.githubusercontent.com/MotionWriter/notion-tiller-portal-public/main/scripts/bootstrap.sh | bash"
	exit 1
fi

echo "ntn: $("$NTN_CMD" --version)"

echo
echo "Checking Notion CLI login..."
if ! "$NTN_CMD" api v1/users/me >/dev/null 2>&1; then
	"$NTN_CMD" login || true
	action_needed "Only now should you run ntn login poll."
	echo "After confirming the browser code, run:"
	echo "  \"$NTN_CMD\" login poll"
	echo
	echo "Then rerun this bootstrap command:"
	echo "  curl -fsSL https://raw.githubusercontent.com/MotionWriter/notion-tiller-portal-public/main/scripts/bootstrap.sh | bash"
	exit 0
fi

echo
npm exec --yes --package="$PACKAGE" -- notion-tiller-portal install
