import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // @pulso/ui se consume como fuente TS del workspace, no como paquete
  // compilado: Next necesita transpilarlo igual que al propio código de app.
  transpilePackages: ['@pulso/ui', '@pulso/contracts', '@pulso/config'],
  webpack: (config) => {
    // Los paquetes del workspace importan con extensión .js estilo NodeNext
    // (ej. './components/Button.js') apuntando a archivos .tsx/.ts reales.
    // El resolver de webpack no hace ese alias por defecto.
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
    };
    return config;
  },
};

export default nextConfig;
