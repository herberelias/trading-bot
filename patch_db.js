const db = require('./src/db');

async function patch() {
    try {
        console.log('--- Iniciando parche de base de datos ---');
        
        // 1. Agregar columna confianza_minima_spot
        try {
            await db.execute('ALTER TABLE users ADD COLUMN confianza_minima_spot DECIMAL(3,2) DEFAULT 0.65 AFTER confianza_minima');
            console.log('✅ Columna confianza_minima_spot añadida a la tabla users.');
        } catch (e) {
            if (e.code === 'ER_DUP_COLUMN_NAME') {
                console.log('ℹ️ La columna confianza_minima_spot ya existe.');
            } else {
                throw e;
            }
        }

        console.log('--- Parche completado exitosamente ---');
        process.exit(0);
    } catch (e) {
        console.error('❌ Error aplicando parche:', e.message);
        process.exit(1);
    }
}

patch();
