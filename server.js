// server.js - Backend para resolver CORS con Tuya API
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Configuración de endpoints por región
const ENDPOINTS = {
    'us': 'https://openapi.tuyaus.com',
    'eu': 'https://openapi.tuyaeu.com',
    'cn': 'https://openapi.tuyacn.com',
    'in': 'https://openapi.tuyain.com'
};

// Función para crear firma HMAC-SHA256
function createSignature(stringToSign, secret) {
    return crypto
        .createHmac('sha256', secret)
        .update(stringToSign)
        .digest('hex')
        .toUpperCase();
}

// Endpoint para obtener token de acceso
app.post('/api/tuya/token', async (req, res) => {
    try {
        const { accessId, accessSecret, region = 'us' } = req.body;
        
        if (!accessId || !accessSecret) {
            return res.status(400).json({
                success: false,
                error: 'Access ID y Access Secret son requeridos'
            });
        }

        const endpoint = ENDPOINTS[region];
        const timestamp = Date.now().toString();
        const stringToSign = `GET\n\n\n${timestamp}\n/v1.0/token?grant_type=1`;
        const signature = createSignature(stringToSign, accessSecret);

        const response = await fetch(`${endpoint}/v1.0/token?grant_type=1`, {
            method: 'GET',
            headers: {
                'client_id': accessId,
                'sign': signature,
                't': timestamp,
                'sign_method': 'HMAC-SHA256'
            }
        });

        const data = await response.json();
        
        if (data.success) {
            res.json({
                success: true,
                access_token: data.result.access_token,
                expire_time: data.result.expire_time
            });
        } else {
            res.status(400).json({
                success: false,
                error: data.msg || 'Error obteniendo token',
                code: data.code
            });
        }
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({
            success: false,
            error: 'Error interno del servidor'
        });
    }
});

// Endpoint para obtener logs del dispositivo
app.post('/api/tuya/device-logs', async (req, res) => {
    try {
        const { 
            accessId, 
            accessSecret, 
            deviceId, 
            startTime, 
            endTime, 
            region = 'us' 
        } = req.body;

        if (!accessId || !accessSecret || !deviceId) {
            return res.status(400).json({
                success: false,
                error: 'Faltan parámetros requeridos'
            });
        }

        const endpoint = ENDPOINTS[region];
        
        // Primero obtener token
        const timestamp1 = Date.now().toString();
        const stringToSign1 = `GET\n\n\n${timestamp1}\n/v1.0/token?grant_type=1`;
        const signature1 = createSignature(stringToSign1, accessSecret);

        const tokenResponse = await fetch(`${endpoint}/v1.0/token?grant_type=1`, {
            method: 'GET',
            headers: {
                'client_id': accessId,
                'sign': signature1,
                't': timestamp1,
                'sign_method': 'HMAC-SHA256'
            }
        });

        const tokenData = await tokenResponse.json();
        
        if (!tokenData.success) {
            return res.status(400).json({
                success: false,
                error: tokenData.msg || 'Error obteniendo token'
            });
        }

        const accessToken = tokenData.result.access_token;

        // Ahora obtener los logs
        const queryParams = new URLSearchParams({
            start_time: startTime || (Date.now() - 24 * 60 * 60 * 1000).toString(),
            end_time: endTime || Date.now().toString(),
            type: '1',
            size: '100'
        });

        const logsUrl = `/v1.0/devices/${deviceId}/logs?${queryParams}`;
        const timestamp2 = Date.now().toString();
        const stringToSign2 = `GET\n\n\n${timestamp2}\n${logsUrl}`;
        const signature2 = createSignature(stringToSign2, accessSecret);

        const logsResponse = await fetch(`${endpoint}${logsUrl}`, {
            method: 'GET',
            headers: {
                'client_id': accessId,
                'access_token': accessToken,
                'sign': signature2,
                't': timestamp2,
                'sign_method': 'HMAC-SHA256'
            }
        });

        const logsData = await logsResponse.json();
        
        if (logsData.success) {
            res.json({
                success: true,
                logs: logsData.result.logs || []
            });
        } else {
            res.status(400).json({
                success: false,
                error: logsData.msg || 'Error obteniendo logs'
            });
        }
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({
            success: false,
            error: 'Error interno del servidor'
        });
    }
});

// Endpoint de prueba
app.get('/api/health', (req, res) => {
    res.json({ 
        success: true, 
        message: 'Backend Tuya funcionando correctamente',
        timestamp: new Date().toISOString()
    });
});

// Endpoint para decodificar Base64
app.post('/api/decode', (req, res) => {
    try {
        const { codes } = req.body;
        
        if (!codes || !Array.isArray(codes)) {
            return res.status(400).json({
                success: false,
                error: 'Se requiere un array de códigos'
            });
        }

        const decoded = codes.map(code => {
            try {
                // Arreglar padding
                let paddedCode = code;
                const missing = code.length % 4;
                if (missing) {
                    paddedCode += '='.repeat(4 - missing);
                }

                // Decodificar Base64
                const buffer = Buffer.from(paddedCode, 'base64');
                
                // Intentar diferentes métodos de conversión
                let userId = null;
                
                if (buffer.length >= 4) {
                    userId = buffer.readUInt32BE(0);
                } else if (buffer.length >= 2) {
                    userId = buffer.readUInt16BE(0);
                } else if (buffer.length >= 1) {
                    userId = buffer[buffer.length - 1];
                }

                return {
                    originalCode: code,
                    decodedId: userId,
                    success: true
                };
            } catch (error) {
                return {
                    originalCode: code,
                    decodedId: null,
                    success: false,
                    error: error.message
                };
            }
        });

        res.json({
            success: true,
            results: decoded
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Error decodificando códigos'
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
});

module.exports = app;