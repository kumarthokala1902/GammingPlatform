pipeline {
    agent any

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Install Dependencies') {
            steps {
                sh 'npm install'
            }
        }

        stage('Lint') {
            steps {
                sh 'npm run lint'
            }
        }

        stage('Build') {
            steps {
                sh 'npm run build'
            }
        }

        stage('Deploy') {
            steps {
                // Install Firebase CLI if not already installed
                sh 'npm install -g firebase-tools'
                // Authenticate and deploy - you may need to set up credentials
                // For example, using a service account key or token
                // sh 'firebase deploy --only hosting --token $FIREBASE_TOKEN'
                // For now, assuming manual auth or pre-configured
                sh 'firebase deploy --only hosting'
            }
        }
    }

    post {
        always {
            echo 'Pipeline completed'
        }
        failure {
            echo 'Pipeline failed'
        }
    }
}
