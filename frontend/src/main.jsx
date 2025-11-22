import React from 'react'
import { createRoot } from 'react-dom/client'

import SolarDashboardDemo from './solar/SolarDashboardDemo.jsx'

// Importamos los estilos globales 
import './index.css'

// Buscamos el elemento con id="root" en index.html
// y montamos nuestra aplicación React ahí.
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {/* Renderizamos el panel de mapeo solar */}
    <SolarDashboardDemo/>
  </React.StrictMode>
)
