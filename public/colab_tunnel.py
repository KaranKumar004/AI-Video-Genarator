import os
import sys
import re
import time
import shutil
import subprocess

def install_cloudflared():
    if shutil.which("cloudflared"):
        print("✅ cloudflared is already installed.")
        return True
        
    print("📥 Installing cloudflared on Colab (Ubuntu)...")
    try:
        # Download and install the official deb package
        subprocess.run(
            ["wget", "-q", "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb"],
            check=True
        )
        subprocess.run(
            ["dpkg", "-i", "cloudflared-linux-amd64.deb"],
            check=True
        )
        # Clean up
        if os.path.exists("cloudflared-linux-amd64.deb"):
            os.remove("cloudflared-linux-amd64.deb")
        print("✅ cloudflared installed successfully!")
        return True
    except Exception as e:
        print(f"❌ Failed to install cloudflared: {e}")
        return False

def start_tunnel(port=8188):
    print(f"⏳ Starting Cloudflared Tunnel on port {port}...")
    
    # Spawn cloudflared tunnel in a subprocess
    process = subprocess.Popen(
        ["cloudflared", "tunnel", "--url", f"http://127.0.0.1:{port}"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1
    )
    
    # Read stderr line-by-line where cloudflared logs connection status
    url_found = False
    start_time = time.time()
    
    try:
        # We poll for 15 seconds to find the trycloudflare URL
        while time.time() - start_time < 20:
            line = process.stderr.readline()
            if not line:
                break
                
            # Print logs for transparency
            sys.stdout.write(line)
            
            # Match trycloudflare url pattern
            match = re.search(r"https://[a-zA-Z0-9-]+\.trycloudflare\.com", line)
            if match:
                url = match.group(0)
                print("\n" + "="*80)
                print("🚀 COMFYUI CLOUD TUNNEL IS LIVE!")
                print(f"🔗 URL: {url}")
                print("="*80 + "\n")
                print("👉 Copy the URL above and paste it into the 'ComfyUI Colab Tunnel URL' field.")
                print("👉 Keep this cell running while using the Local AI Studio!\n")
                url_found = True
                break
                
        if not url_found:
            print("\n❌ Failed to extract Cloudflare tunnel URL automatically.")
            print("Try running this fallback command to use Pinggy SSH Tunnel instead:")
            print("!ssh -o StrictHostKeyChecking=no -R 80:localhost:8188 a.pinggy.io")
            
        # Continue printing logs in background so the user can monitor active requests
        while True:
            line = process.stderr.readline()
            if not line:
                break
            sys.stdout.write(line)
            
    except KeyboardInterrupt:
        print("\n🔌 Stopping tunnel...")
    finally:
        process.terminate()

if __name__ == "__main__":
    # Check if running in colab/linux environment
    is_linux = sys.platform.startswith("linux")
    if not is_linux:
        print("⚠️ Warning: This script is intended to run inside Google Colab (Linux environment).")
        print("If you run it locally on Windows, it might fail to install the Debian package.")
        
    installed = install_cloudflared()
    if installed:
        start_tunnel()
