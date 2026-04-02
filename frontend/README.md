# K-Golf - Premium Screen Golf Booking Platform

![K-Golf Logo](public/placeholder-logo.png)

A modern, responsive web application for booking premium screen golf simulator rooms. Built with React, TypeScript, and TailwindCSS.

## 🏌️‍♂️ Features

- **User Authentication** - Secure login and registration system
- **Room Booking** - Interactive booking system with real-time availability
- **Dashboard** - Personal booking management and history
- **Admin Panel** - Complete administrative control over bookings and rooms
- **Responsive Design** - Optimized for desktop, tablet, and mobile devices
- **Premium UI** - Modern dark theme with gradient accents

## 🛠️ Tech Stack

- **Frontend**: React 18, TypeScript
- **Styling**: TailwindCSS v4, Radix UI Components
- **Routing**: React Router DOM
- **Build Tool**: Webpack 5
- **Development Server**: Webpack Dev Server
- **Package Manager**: npm/pnpm

## 📋 Prerequisites

### Required Node.js Version
**Node.js 20.x or higher is required**

You can check your current Node.js version:
```bash
node --version
```

If you need to upgrade Node.js:
- Download from [nodejs.org](https://nodejs.org/)
- Or use a version manager like [nvm](https://github.com/nvm-sh/nvm):
  ```bash
  nvm install 20
  nvm use 20
  ```

### Why Node.js 20+?
- TailwindCSS v4 requires Node.js 18+ for `structuredClone` support
- Node.js 20+ provides better performance and stability
- Future-proofing for modern JavaScript features

## 🚀 Getting Started

### 1. Clone the Repository
```bash
git clone https://github.com/HanKyungSung/k-golf.git
cd k-golf
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Start Development Server
```bash
npm run dev
```

The application will open automatically at [http://localhost:5173](http://localhost:5173)

### 4. Build for Production
```bash
npm run build
```

### 5. Preview Production Build
```bash
npm run preview
```

## 📁 Project Structure

```
k-golf/
├── app/                    # Page components (Next.js-style structure)
│   ├── page.tsx           # Landing page
│   ├── login/page.tsx     # Login page
│   ├── signup/page.tsx    # Registration page
│   ├── dashboard/page.tsx # User dashboard
│   ├── booking/page.tsx   # Booking interface
│   └── admin/page.tsx     # Admin panel
├── components/            # Reusable UI components
│   ├── ui/               # Radix UI components
│   └── theme-provider.tsx
├── hooks/                # Custom React hooks
│   └── use-auth.tsx      # Authentication hook
├── lib/                  # Utility functions
│   └── utils.ts
├── public/               # Static assets
│   └── favicon.svg      # K lettermark SVG favicon (emerald gradient)
├── src/                  # Application entry point
│   ├── main.tsx         # React app entry
│   ├── App.tsx          # Main app component with routing
│   └── shims/           # Next.js compatibility shims
├── styles/              # Global styles
└── webpack.config.js    # Webpack configuration
```

## 🔐 Authentication System

### User Roles
- **Regular Users**: Can book rooms and manage their bookings
- **Administrators**: Full access to booking and room management

### Default Test Accounts
The application uses local storage for development. You can sign up with any email/password combination.

## 🏠 Available Rooms

### Premium Suite A
- **Capacity**: 4 people
- **Rate**: $80/hour, $45/30 minutes
- **Features**: 4K Display, Premium Sound, Climate Control, Refreshments

### Standard Room B
- **Capacity**: 2 people  
- **Rate**: $50/hour, $30/30 minutes
- **Features**: HD Display, Sound System, Air Conditioning

### Large Suite C
- **Capacity**: 6 people
- **Rate**: $100/hour, $60/30 minutes
- **Features**: Premium amenities for large groups

## 🔧 Development

### Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build locally |

### Development Server
- **Port**: 5173
- **Hot Reload**: Enabled
- **Auto Open**: Browser opens automatically

### Build Output
- **Directory**: `dist/`
- **Assets**: Optimized and hashed for caching
- **Source Maps**: Generated for debugging

## 🎨 Styling

### TailwindCSS Configuration
- **Version**: 4.x (Latest)
- **Theme**: Custom dark theme with amber/yellow accents
- **Components**: Pre-built with Radix UI
- **Animations**: Custom CSS animations included

### Color Scheme
- **Primary**: Amber/Yellow gradients
- **Background**: Slate dark tones
- **Text**: White/Gray for readability
- **Status Colors**: Green (confirmed), Yellow (pending), Red (cancelled)

## 🔍 Troubleshooting

### Common Issues

#### Node.js Version Error
```
ReferenceError: structuredClone is not defined
```
**Solution**: Upgrade to Node.js 20+ as specified in prerequisites.

#### Port Already in Use
```
Error: listen EADDRINUSE: address already in use :::5173
```
**Solution**: Kill the process using port 5173 or change port in `webpack.config.js`.

#### Build Failures
1. Clear node_modules: `rm -rf node_modules package-lock.json`
2. Reinstall dependencies: `npm install`
3. Try building again: `npm run build`

### Getting Help
- Check the [Issues](https://github.com/HanKyungSung/k-golf/issues) page
- Review the site flow documentation in `SITE_FLOW.md`

## 📈 Performance

### Optimization Features
- **Code Splitting**: Automatic chunk splitting with Webpack
- **Image Optimization**: Webpack asset optimization
- **CSS Purging**: Unused styles removed in production
- **Compression**: Gzip compression enabled

### Bundle Analysis
To analyze bundle size:
```bash
npm run build
# Check dist/ folder for generated files
```

## 🚀 Deployment

### Production Checklist
- [ ] Node.js 20+ on server
- [ ] Environment variables configured
- [ ] Static assets properly served
- [ ] HTTPS enabled
- [ ] Domain configured

### Deployment Options
- **Static Hosting**: Netlify, Vercel, GitHub Pages
- **Traditional Hosting**: Apache, Nginx
- **Cloud Platforms**: AWS S3 + CloudFront, Azure Static Web Apps

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is private and proprietary.

## 👨‍💻 Author

**HanKyungSung** - [GitHub Profile](https://github.com/HanKyungSung)

---

## 🔗 Quick Links

- [Site Flow Documentation](./SITE_FLOW.md) - Complete user journey flowcharts
- [Component Documentation](./components/) - UI component library
- [API Documentation](./docs/api.md) - Backend API reference (if applicable)

---

**Happy Golfing! ⛳**
