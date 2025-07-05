const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Configuración Tuya
const ACCESS_TOKEN = '461d4406af5d2e8d989f516b4c8dcb41'; // Tu token del API Explorer
const DEVICE_ID = 'ebab8ba2f5c81024eacxaj';
const BASE_URL = 'https://openapi.tuyaus.com';

// Decodificar Base64 a ID de usuario
function decodeBase64ToUserId(base64String) {
    try {
        // Arreglar padding si es necesario
        let padded = base64String;
        const missing = base64String.length % 4;
        if (missing) {
            padded += '='.repeat(4 - missing);
        }

        const buffer = Buffer.from(padded, 'base64');
        
        // Método específico para tus códigos
        if (buffer.length >= 4) {
            // Intentar diferentes posiciones
            const userId = buffer.readUInt32BE(0);
            if (userId >= 1 && userId <= 4) return userId;
        }
        
        // Buscar byte específico que coincida con tus IDs (1,2,3,4)
        for (let i = 0; i < buffer.length; i++) {
            const byte = buffer[i];
            if (byte >= 1 && byte <= 4) {
                return byte;
            }
        }
        
        return null;
    } catch (error) {
        console.error('❌ Error decodificando Base64:', error);
        return null;
    }
}

// Obtener logs del dispositivo usando token fijo
async function getDeviceLogs(hours = 24) {
    const endTime = Date.now();
    const startTime = endTime - (hours * 60 * 60 * 1000);
    
    const url = `${BASE_URL}/v1.0/devices/${DEVICE_ID}/logs?start_time=${startTime}&end_time=${endTime}&type=1&size=100`;

    const headers = {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
    };

    try {
        console.log('🔍 Consultando logs...');
        console.log('URL:', url);
        
        const response = await axios.get(url, { headers });
        console.log('📦 Respuesta de logs:', response.data);
        
        if (response.data.success) {
            return response.data.result.logs || [];
        } else {
            throw new Error(response.data.msg || 'Error obteniendo logs');
        }
    } catch (error) {
        console.error('❌ Error al obtener logs:', error.response?.data || error.message);
        throw error;
    }
}

// Rutas
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        message: 'Backend Tuya funcionando correctamente',
        timestamp: new Date().toISOString(),
        baseUrl: BASE_URL,
        deviceId: DEVICE_ID,
        hasToken: !!ACCESS_TOKEN
    });
});

app.get('/api/test-tuya', async (req, res) => {
    try {
        // Probar una consulta simple con el token
        const url = `${BASE_URL}/v1.0/devices/${DEVICE_ID}`;
        const headers = {
            'Authorization': `Bearer ${ACCESS_TOKEN}`,
            'Content-Type': 'application/json'
        };
        
        const response = await axios.get(url, { headers });
        
        res.json({
            success: true,
            message: 'Conexión Tuya exitosa con token fijo',
            deviceInfo: response.data.result,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.response?.data || error.message,
            timestamp: new Date().toISOString()
        });
    }
});

app.get('/api/device-logs', async (req, res) => {
    try {
        const hours = parseInt(req.query.hours) || 24;
        const logs = await getDeviceLogs(hours);

        const processedLogs = [];
        
        logs.forEach(log => {
            console.log('📝 Procesando log:', log);
            
            // Buscar códigos Base64 en event_data
            let encodedValue = null;
            if (log.event_data) {
                for (const [key, value] of Object.entries(log.event_data)) {
                    if (typeof value === 'string' && value.length > 6) {
                        encodedValue = value;
                        break;
                    }
                }
            }
            
            if (encodedValue) {
                const decodedUserId = decodeBase64ToUserId(encodedValue);
                
                // Mapeo de nombres
                const userNames = {
                    1: 'Juan Pérez',
                    2: 'María García',
                    3: 'Carlos López',
                    4: 'Ana Martínez'
                };
                
                processedLogs.push({
                    timestamp: new Date(log.event_time),
                    originalCode: encodedValue,
                    decodedUserId: decodedUserId,
                    userName: userNames[decodedUserId] || `Usuario ${decodedUserId}`,
                    eventType: log.event_name || 'fingerprint_unlock',
                    deviceId: log.device_id,
                    rawLog: log
                });
            }
        });

        res.json({
            success: true,
            logs: processedLogs,
            totalLogs: logs.length,
            processedLogs: processedLogs.length,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.response?.data || error.message,
            timestamp: new Date().toISOString()
        });
    }
});

app.post('/api/decode', (req, res) => {
    const { base64String } = req.body;

    if (!base64String) {
        return res.status(400).json({
            success: false,
            error: 'base64String es requerido'
        });
    }

    const userId = decodeBase64ToUserId(base64String);
    
    const userNames = {
        1: 'Juan Pérez',
        2: 'María García', 
        3: 'Carlos López',
        4: 'Ana Martínez'
    };

    res.json({
        success: true,
        original: base64String,
        decoded: userId,
        userName: userNames[userId] || `Usuario ${userId}`,
        timestamp: new Date().toISOString()
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
    console.log(`🌎 Usando endpoint: ${BASE_URL}`);
    console.log(`🔑 Token configurado: ${ACCESS_TOKEN.substring(0, 10)}...`);
    console.log(`📱 Device ID: ${DEVICE_ID}`);
});
