const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Configuración Tuya
const ACCESS_ID = 'gee4cmurretydq8p7m9cu';
const ACCESS_SECRET = '01433d5f4d794a25858f00bb6d5df851';
const DEVICE_ID = 'ebab8ba2f5c81024eacxaj';
const BASE_URL = 'https://openapi.tuya.com';
// Función mejorada para generar signature
function generateSignature(method, url, timestamp, nonce, body = '') {
    const bodyHash = crypto.createHash('sha256').update(body || '').digest('hex');
    const headers = '';
    const stringToSign = [method, bodyHash, headers, url].join('\n');
    const signStr = ACCESS_ID + timestamp + nonce + stringToSign;
    
    console.log('=== DEBUG SIGNATURE ===');
    console.log('Method:', method);
    console.log('URL:', url);
    console.log('Body:', body);
    console.log('Body Hash:', bodyHash);
    console.log('String to Sign:', stringToSign);
    console.log('Sign String:', signStr);
    
    const signature = crypto.createHmac('sha256', ACCESS_SECRET).update(signStr).digest('hex').toUpperCase();
    console.log('Generated Signature:', signature);
    console.log('======================');
    
    return signature;
}

// Función para decodificar Base64
function decodeBase64ToUserId(base64) {
    try {
        const buffer = Buffer.from(base64, 'base64');
        if (buffer.length >= 4) {
            return buffer.readUInt32BE(0);
        }
        return null;
    } catch (error) {
        console.error('Error decodificando Base64:', error);
        return null;
    }
}

// Endpoint de salud
app.get('/api/health', (req, res) => {
    res.json({ 
        success: true, 
        message: 'Backend Tuya funcionando correctamente',
        timestamp: new Date().toISOString(),
        config: {
            access_id: ACCESS_ID,
            device_id: DEVICE_ID,
            base_url: BASE_URL
        }
    });
});

// Endpoint para obtener token
app.post('/api/tuya/token', async (req, res) => {
    try {
        const timestamp = Date.now().toString();
        const nonce = crypto.randomBytes(16).toString('hex');
        const url = '/v1.0/token?grant_type=1';
        
        const signature = generateSignature('GET', url, timestamp, nonce);
        
        const headers = {
            'client_id': ACCESS_ID,
            'sign': signature,
            'sign_method': 'HMAC-SHA256',
            't': timestamp,
            'nonce': nonce,
            'Content-Type': 'application/json'
        };

        console.log('=== TOKEN REQUEST ===');
        console.log('Headers:', headers);
        console.log('URL:', `${BASE_URL}${url}`);

        const response = await fetch(`${BASE_URL}${url}`, {
            method: 'GET',
            headers: headers
        });

        const data = await response.json();
        
        console.log('Token Response:', data);
        
        res.json(data);
    } catch (error) {
        console.error('Error obteniendo token:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Endpoint para obtener logs del dispositivo
app.post('/api/tuya/device-logs', async (req, res) => {
    try {
        // Primero obtener token
        const timestamp = Date.now().toString();
        const nonce = crypto.randomBytes(16).toString('hex');
        const tokenUrl = '/v1.0/token?grant_type=1';
        
        const tokenSignature = generateSignature('GET', tokenUrl, timestamp, nonce);
        
        const tokenHeaders = {
            'client_id': ACCESS_ID,
            'sign': tokenSignature,
            'sign_method': 'HMAC-SHA256',
            't': timestamp,
            'nonce': nonce
        };

        const tokenResponse = await fetch(`${BASE_URL}${tokenUrl}`, {
            method: 'GET',
            headers: tokenHeaders
        });

        const tokenData = await tokenResponse.json();
        
        if (!tokenData.success) {
            return res.status(401).json({
                success: false,
                error: 'Error obteniendo token',
                details: tokenData
            });
        }

        const accessToken = tokenData.result.access_token;
        
        // Ahora obtener logs del dispositivo
        const logsTimestamp = Date.now().toString();
        const logsNonce = crypto.randomBytes(16).toString('hex');
        const logsUrl = `/v1.0/devices/${DEVICE_ID}/logs`;
        
        const logsSignature = generateSignature('GET', logsUrl, logsTimestamp, logsNonce);
        
        const logsHeaders = {
            'client_id': ACCESS_ID,
            'sign': logsSignature,
            'sign_method': 'HMAC-SHA256',
            't': logsTimestamp,
            'nonce': logsNonce,
            'access_token': accessToken
        };

        const logsResponse = await fetch(`${BASE_URL}${logsUrl}`, {
            method: 'GET',
            headers: logsHeaders
        });

        const logsData = await logsResponse.json();
        
        if (logsData.success && logsData.result) {
            // Procesar logs y decodificar Base64
            const processedLogs = logsData.result.map(log => {
                if (log.event_data) {
                    const userId = decodeBase64ToUserId(log.event_data);
                    return {
                        ...log,
                        decoded_user_id: userId,
                        user_name: getUserName(userId)
                    };
                }
                return log;
            });
            
            res.json({
                success: true,
                result: processedLogs
            });
        } else {
            res.json(logsData);
        }
    } catch (error) {
        console.error('Error obteniendo logs:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Endpoint para decodificar Base64
app.post('/api/decode', (req, res) => {
    try {
        const { base64 } = req.body;
        
        if (!base64) {
            return res.status(400).json({
                success: false,
                error: 'Base64 string requerido'
            });
        }

        const userId = decodeBase64ToUserId(base64);
        
        res.json({
            success: true,
            result: {
                base64: base64,
                decoded_user_id: userId,
                user_name: getUserName(userId)
            }
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Función auxiliar para obtener nombre de usuario
function getUserName(userId) {
    const userNames = {
        1: 'Juan Pérez',
        4: 'María González',
        192: 'Carlos Rodríguez',
        128: 'Ana Martínez'
    };
    
    return userNames[userId] || `Usuario ${userId}`;
}

// Endpoint para probar conectividad con Tuya
app.get('/api/test-tuya', async (req, res) => {
    try {
        const timestamp = Date.now().toString();
        const nonce = crypto.randomBytes(16).toString('hex');
        const url = '/v1.0/token?grant_type=1';
        
        const signature = generateSignature('GET', url, timestamp, nonce);
        
        const headers = {
            'client_id': ACCESS_ID,
            'sign': signature,
            'sign_method': 'HMAC-SHA256',
            't': timestamp,
            'nonce': nonce
        };

        const response = await fetch(`${BASE_URL}${url}`, {
            method: 'GET',
            headers: headers
        });

        const data = await response.json();
        
        res.json({
            success: true,
            test_result: data,
            debug_info: {
                timestamp,
                nonce,
                signature,
                headers
            }
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Backend Tuya corriendo en puerto ${PORT}`);
    console.log(`📡 Endpoints disponibles:`);
    console.log(`   GET  /api/health`);
    console.log(`   POST /api/tuya/token`);
    console.log(`   POST /api/tuya/device-logs`);
    console.log(`   POST /api/decode`);
    console.log(`   GET  /api/test-tuya`);
    console.log(`⚙️  Configuración:`);
    console.log(`   Access ID: ${ACCESS_ID}`);
    console.log(`   Device ID: ${DEVICE_ID}`);
    console.log(`   Base URL: ${BASE_URL}`);
});
