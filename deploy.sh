#!/bin/bash

SERVER="access-5019671226.webspace-host.com"
USER="a1760200"
PORT=22

echo "=== Hotel Deposit Deployment Script ==="

# Get database credentials
read -p "MariaDB Host: " DB_HOST
read -p "MariaDB User: " DB_USER
read -p "MariaDB Password: " -s DB_PASSWORD
echo ""
read -p "Database Name: " DB_NAME

echo ""
echo "Uploading files..."
rsync -avz --exclude 'node_modules' --exclude '.git' --exclude '.env' -e "ssh -p $PORT" . $USER@$SERVER:~/hoteldeposit/

ssh -p $PORT $USER@$SERVER << EOF
    cd ~/hoteldeposit

    # Install dependencies
    npm install --production

    # Set environment variables
    export DB_HOST="$DB_HOST"
    export DB_USER="$DB_USER"
    export DB_PASSWORD="$DB_PASSWORD"
    export DB_NAME="$DB_NAME"
    export PORT=3000
    export NODE_ENV=production

    # Set up database (run once)
    # mysql -h \$DB_HOST -u \$DB_USER -p\$DB_PASSWORD < schema-mysql.sql

    # Run with PM2
    cd ~/hoteldeposit
    pm2 stop hoteldeposit 2>/dev/null || true
    pm2 start server.js --name hoteldeposit
    pm2 save

    echo "Deployment complete!"
    pm2 status
EOF
