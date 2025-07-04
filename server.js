const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Configuración Tuya
const ACCESS_ID = 'gee4cmurretydq8p7m9cu';
const ACCESS_SECRET = '01433d5f4d794a25858f00bb6d5df851';
const DEVICE_ID = 'ebab8ba2f5c81024eacxaj';
const BASE_URL = 'https://openapi.tuyaus.com'; // Fijo y correcto para tu región

// Función para generar firma
function generateSign(method, url, body, timestamp) {
  const stringToSign =
    method + '\n' +
    crypto.createHash('sha256').update(body || '').digest('hex') + '\n' +
    '' + '\n' +
    url;

  const signStr = ACCESS_ID + timestamp + stringToSign;
  const sign = crypto.createHmac('sha256', ACCESS_SECRET).update(signStr).digest('hex').toUpperCase();

  return sign;
}

// Obtener token
async function getToken() {
  const timestamp = Date.now().toString();
  const method = 'GET';
  const url = '/v1.0/token?grant_type=1';
  const fullUrl = BASE_URL + url;

  const sign = generateSign(method, url, '', timestamp);

  const headers = {
    'client_id': ACCESS_ID,
    'sign': sign,
    't': timestamp,
    'sign_method': 'HMAC-SHA256'
  };

  try {
    const response = await axios.get(fullUrl, { headers });

    console.log('📦 Respuesta completa del token:');
    console.dir(response.data, { depth: null });

    const token = response.data?.result?.access_token;

    if (!token) {
      throw new Error('❌ No se pudo obtener access_token');
    }

    return token;

  } catch (error) {
    console.error('❌ Error al obtener token:', error.response?.data || error.message);
    throw error;
  }
}


// Obtener logs del dispositivo
async function getDeviceLogs(token) {
  const timestamp = Date.now().toString();
  const method = 'GET';
  const url = `/v1.0/devices/${DEVICE_ID}/logs`;
  const fullUrl = BASE_URL + url;

  const sign = generateSign(method, url, '', timestamp);

  const headers = {
    'client_id': ACCESS_ID,
    'access_token': token,
    'sign': sign,
    't': timestamp,
    'sign_method': 'HMAC-SHA256'
  };

  const response = await axios.get(fullUrl, { headers });
  return response.data.result;
}

// Decodificar Base64 a ID de usuario
function decodeBase64ToUserId(base64String) {
  try {
    const buffer = Buffer.from(base64String, 'base64');
    const userId = buffer.readUInt32BE(4);
    return userId;
  } catch (error) {
    console.error('❌ Error decodificando Base64:', error);
    return null;
  }
}

// Rutas
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Backend Tuya funcionando correctamente',
    timestamp: new Date().toISOString(),
    baseUrl: BASE_URL
  });
});

app.get('/api/test-tuya', async (req, res) => {
  try {
    const token = await getToken();

    res.json({
      success: true,
      message: 'Conexión Tuya exitosa',
      token: token.substring(0, 10) + '...',
      baseUrl: BASE_URL,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.response?.data || error.message,
      baseUrl: BASE_URL,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/api/device-logs', async (req, res) => {
  try {
    const token = await getToken();
    const logs = await getDeviceLogs(token);

    const processedLogs = logs.map(log => {
      const decodedUserId = decodeBase64ToUserId(log.value);
      return {
        ...log,
        originalValue: log.value,
        decodedUserId: decodedUserId,
        userName: `Usuario ${decodedUserId}`,
        timestamp: new Date(log.event_time).toLocaleString('es-ES')
      };
    });

    res.json({
      success: true,
      logs: processedLogs,
      count: processedLogs.length,
      baseUrl: BASE_URL,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.response?.data || error.message,
      baseUrl: BASE_URL,
      timestamp: new Date().toISOString()
    });
  }
});

app.post('/api/decode', (req, res) => {
  const { base64String } = req.body;

  if (!base64String) {
    return res.status(400).json({
      success: false,
      error: 'base64String is required'
    });
  }

  const userId = decodeBase64ToUserId(base64String);

  res.json({
    success: true,
    original: base64String,
    decoded: userId,
    userName: `Usuario ${userId}`,
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
  console.log(`🌎 Usando endpoint fijo: ${BASE_URL}`);
});
