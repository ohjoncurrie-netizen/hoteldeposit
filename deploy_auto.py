#!/usr/bin/env python3
import paramiko
import os
import time

HOST = 'access-5019671226.webspace-host.com'
PORT = 22
USER = 'a1760200'
PASSWORD = 'Lol123lol!!'

DB_HOST = 'db5019909289.hosting-data.io'
DB_USER = 'dbu1103880'
DB_PASSWORD = '2120hotelpass!!'
DB_NAME = 'dbs15378904'

LOCAL_DIR = '.'
IGNORE = {'node_modules', '.git', '.env', '.vscode', '__pycache__', 'deploy_auto.py', '.github'}

def deploy():
    print("=== Connecting to server ===")
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, PORT, USER, PASSWORD)
    
    sftp = client.open_sftp()
    
    print("=== Uploading files ===")
    for root, dirs, files in os.walk(LOCAL_DIR):
        dirs[:] = [d for d in dirs if d not in IGNORE]
        rel = os.path.relpath(root, LOCAL_DIR)
        if rel == '.':
            continue
        try:
            sftp.mkdir(rel)
        except:
            pass
        
        for f in files:
            if f in IGNORE:
                continue
            local_path = os.path.join(root, f)
            remote_path = os.path.join(rel, f) if rel != '.' else f
            try:
                sftp.put(local_path, remote_path)
                print(f"  Uploaded: {remote_path}")
            except Exception as e:
                print(f"  Error uploading {remote_path}: {e}")
    
    sftp.close()
    
    print("=== Running deployment commands ===")
    commands = [
        'cd ~/hoteldeposit',
        'npm install --production',
        f'export DB_HOST="{DB_HOST}" DB_USER="{DB_USER}" DB_PASSWORD="{DB_PASSWORD}" DB_NAME="{DB_NAME}" PORT=3000 NODE_ENV=production',
        'pm2 stop hoteldeposit 2>/dev/null || true',
        'pm2 start server.js --name hoteldeposit',
        'pm2 save',
        'pm2 status'
    ]
    
    for cmd in commands:
        print(f"Running: {cmd}")
        stdin, stdout, stderr = client.exec_command(cmd)
        exit_status = stdout.channel.recv_exit_status()
        print(stdout.read().decode())
        err = stderr.read().decode()
        if err:
            print(f"Errors: {err}")
    
    client.close()
    print("=== Deployment complete! ===")

if __name__ == '__main__':
    deploy()
