const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración CORS
app.use(cors());
app.use(express.json());

// Configuración Tuya
const ACCESS_ID = 'gee4cmurretydq8p7m9cu';
const ACCESS_SECRET = '01433d5f4d794a25858f00bb6d5df851';
const DEVICE_ID = 'ebab8ba2f5c81024eacxaj';

// Todos los endpoints posibles de Tuya
const TUYA_ENDPOINTS = [
  'https://openapi.tuyaus.com',      // Western America
  'https://openapi.tuyaeu.com',      // Central Europe
  'https://openapi.tuyacn.com',      // China
  'https://openapi-ueaz.tuyaus.com', // Eastern America
  'https://openapi-weaz.tuyaeu.com', // Western Europe
  'https://openapi.tuyain.com'       // India
];

let WORKING_BASE_URL = null;

// Función para generar firma
function generateSign(method, url, body, timestamp) {
  const stringToSign = method + '\n' + 
                      crypto.createHash('sha256').update(body || '').digest('hex') + '\n' + 
                      '' + '\n' + 
                      url;
  
  const signStr = ACCESS_ID + timestamp + stringToSign;
  const sign = crypto.createHmac('sha256', ACCESS_SECRET).update(signStr).digest('hex').toUpperCase();
  
  return sign;
}

// Función para probar un endpoint
async function testEndpoint(baseUrl) {
  try {
    const timestamp = Date.now().toString();
    const method = 'GET';
    const url = '/v1.0/token?grant_type=1';
    const fullUrl = baseUrl + url;
    
    const sign = generateSign(method, url, '', timestamp);
    
    const headers = {
      'client_id': ACCESS_ID,
      'sign': sign,
      't': timestamp,
      'sign_method': 'HMAC-SHA256'
    };
    
    console.log(`🧪 Probando endpoint: ${baseUrl}`);
    
    const response = await axios.get(fullUrl, { 
      headers,
      timeout: 5000 // 5 segundos timeout
    });
    
    if (response.data.success) {
      console.log(`✅ Endpoint funcionando: ${baseUrl}`);
      return { success: true, data: response.data, baseUrl };
    } else {
      console.log(`❌ Endpoint falló: ${baseUrl} - ${response.data.msg}`);
      return { success: false, error: response.data.msg, baseUrl };
    }
    
  } catch (error) {
    console.log(`❌ Error en endpoint: ${baseUrl} - ${error.message}`);
    return { success: false, error: error.message, baseUrl };
  }
}

// Función para encontrar el endpoint correcto
async function findWorkingEndpoint() {
  console.log('🔍 Buscando endpoint correcto...');
  
  for (const endpoint of TUYA_ENDPOINTS) {
    const result = await testEndpoint(endpoint);
    if (result.success) {
      WORKING_BASE_URL = endpoint;
      console.log(`🎯 Endpoint encontrado: ${endpoint}`);
      return endpoint;
    }
  }
  
  throw new Error('No se encontró ningún endpoint funcionando');
}

// Función para obtener token
async function getToken() {
  try {
    if (!WORKING_BASE_URL) {
      await findWorkingEndpoint();
    }
    
    const timestamp = Date.now().toString();
    const method = 'GET';
    const url = '/v1.0/token?grant_type=1';
    const fullUrl = WORKING_BASE_URL + url;
    
    const sign = generateSign(method, url, '', timestamp);
    
    const headers = {
      'client_id': ACCESS_ID,
      'sign': sign,
      't': timestamp,
      'sign_method': 'HMAC-SHA256'
    };
    
    const response = await axios.get(fullUrl, { headers });
    return response.data.result.access_token;
    
  } catch (error) {
    console.error('❌ Error obteniendo token:', error.response?.data || error.message);
    throw error;
  }
}

// Función para obtener logs del dispositivo
async function getDeviceLogs(token) {
  try {
    const timestamp = Date.now().toString();
    const method = 'GET';
    const url = `/v1.0/devices/${DEVICE_ID}/logs`;
    const fullUrl = WORKING_BASE_URL + url;
    
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
    
  } catch (error) {
    console.error('❌ Error obteniendo logs:', error.response?.data || error.message);
    throw error;
  }
}

// Función para decodificar Base64
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
    workingEndpoint: WORKING_BASE_URL
  });
});

app.get('/api/test-endpoints', async (req, res) => {
  try {
    console.log('🧪 Probando todos los endpoints...');
    
    const results = [];
    
    for (const endpoint of TUYA_ENDPOINTS) {
      const result = await testEndpoint(endpoint);
      results.push(result);
    }
    
    res.json({
      success: true,
      results: results,
      workingEndpoint: WORKING_BASE_URL,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/api/test-tuya', async (req, res) => {
  try {
    console.log('🧪 Iniciando prueba de conexión Tuya...');
    
    const token = await getToken();
    
    res.json({
      success: true,
      message: 'Conexión Tuya exitosa',
      token: token.substring(0, 10) + '...',
      workingEndpoint: WORKING_BASE_URL,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.response?.data || error.message,
      workingEndpoint: WORKING_BASE_URL,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/api/device-logs', async (req, res) => {
  try {
    console.log('📋 Obteniendo logs del dispositivo...');
    
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
      workingEndpoint: WORKING_BASE_URL,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.response?.data || error.message,
      workingEndpoint: WORKING_BASE_URL,
      timestamp: new Date().toISOString()
    });
  }
});

app.post('/api/decode', (req, res) => {
  try {
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
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
  console.log(`🔍 Buscando endpoint correcto automáticamente...`);
});
