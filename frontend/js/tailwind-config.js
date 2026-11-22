// tailwind-config.js — Configuração oficial extraída da landing page
tailwind.config = {
  theme: {
    extend: {
      colors: {
        primary: '#1E88E5',   // Azul Estratosfera
        secondary: '#00E5FF', // Ciano Aerodinâmico
        accent: '#FF6D00',    // Laranja Alta Visibilidade
        cloud: '#FAFAFA',     // Branco Nuvem
        carbon: '#2C3E50',    // Carbono Suave
      },
      fontFamily: {
        poppins: ['Poppins', 'sans-serif'],
        inter: ['Inter', 'sans-serif'],
      },
      boxShadow: {
        glass: '0 8px 32px 0 rgba(30, 136, 229, 0.1)',
        glow: '0 0 20px rgba(255, 109, 0, 0.4)',
      },
    },
  },
};
