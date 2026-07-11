import React, { useState, useEffect } from "react";
import { syncMedia } from "../lib/mediaSync";

export default function LogoIcon({ 
  className = "w-12 h-12", 
  rounded = true 
}: { 
  className?: string; 
  rounded?: boolean; 
}) {
  const [customLogoUrl, setCustomLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let url: string | null = null;

    const loadCustomLogo = async () => {
      try {
        const blob = await syncMedia("custom_logo");
        if (blob && active) {
          if (url) URL.revokeObjectURL(url);
          url = URL.createObjectURL(blob);
          setCustomLogoUrl(url);
        } else if (!blob && active) {
          setCustomLogoUrl(null);
        }
      } catch (err) {
        console.warn("Failed to load custom logo", err);
      }
    };

    loadCustomLogo();

    // Listen for logo updates to instantly refresh throughout the app
    const handleLogoUpdate = () => {
      loadCustomLogo();
    };
    window.addEventListener("custom-logo-updated", handleLogoUpdate);

    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
      window.removeEventListener("custom-logo-updated", handleLogoUpdate);
    };
  }, []);

  if (customLogoUrl) {
    return (
      <img 
        src={customLogoUrl} 
        alt="Royal Coaching Centre Logo" 
        className={`${className} object-contain select-none drop-shadow-md hover:scale-105 transition-all duration-500 ${rounded ? "rounded-full border border-slate-100 bg-white" : ""}`}
        referrerPolicy="no-referrer"
      />
    );
  }

  return (
    <svg 
      className={`${className} select-none drop-shadow-md hover:scale-105 transition-all duration-500`} 
      viewBox="0 0 400 400" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      id="royal-logo-svg"
    >
      <defs>
        {/* Wood Outer Ring Gradient */}
        <radialGradient id="wood-grad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#4a2c11" />
          <stop offset="70%" stopColor="#2e1a0a" />
          <stop offset="100%" stopColor="#1c0f05" />
        </radialGradient>

        {/* Shiny Blue Center Shield */}
        <linearGradient id="shield-blue" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#2563eb" />
          <stop offset="40%" stopColor="#1d4ed8" />
          <stop offset="100%" stopColor="#1e3a8a" />
        </linearGradient>

        {/* Royal Gold Gradients */}
        <linearGradient id="gold-bright" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fef08a" />
          <stop offset="50%" stopColor="#eab308" />
          <stop offset="100%" stopColor="#ca8a04" />
        </linearGradient>

        <linearGradient id="gold-banner" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#ca8a04" />
          <stop offset="30%" stopColor="#fef08a" />
          <stop offset="70%" stopColor="#eab308" />
          <stop offset="100%" stopColor="#ca8a04" />
        </linearGradient>

        {/* Ruby Red 3D Gradient for Letter R */}
        <linearGradient id="ruby-red" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f87171" />
          <stop offset="30%" stopColor="#ef4444" />
          <stop offset="70%" stopColor="#b91c1c" />
          <stop offset="100%" stopColor="#7f1d1d" />
        </linearGradient>

        {/* Shadow Filters for 3D depth */}
        <filter id="shadow-main" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="2" dy="4" stdDeviation="3" floodColor="#000" floodOpacity="0.7" />
        </filter>
        <filter id="r-glow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="3" dy="5" stdDeviation="4" floodColor="#000" floodOpacity="0.8" />
        </filter>
      </defs>

      {/* 1. Ornate Wooden Base Frame */}
      <circle cx="200" cy="200" r="195" fill="url(#wood-grad)" stroke="url(#gold-bright)" strokeWidth="6" filter="url(#shadow-main)" />
      <circle cx="200" cy="200" r="185" stroke="#1c0f05" strokeWidth="2" />
      <circle cx="200" cy="200" r="182" stroke="url(#gold-bright)" strokeWidth="1" strokeDasharray="3 3" />

      {/* 2. Text Paths Definitions */}
      <path id="outer-text-path" d="M 46,200 A 154,154 0 1,1 354,200" fill="none" />
      <path id="inner-top-path" d="M 85,200 A 115,115 0 0,1 315,200" fill="none" />
      <path id="inner-bottom-path" d="M 315,200 A 115,115 0 0,1 85,200" fill="none" />

      {/* 3. Outer Slogan Text */}
      <text fill="#fbcfe8" fontFamily="system-ui, -apple-system, sans-serif" fontSize="11" fontWeight="800" letterSpacing="1.2" filter="url(#shadow-main)">
        <textPath href="#outer-text-path" startOffset="50%" textAnchor="middle">
          A Course That Can Change The Course of Your Life
        </textPath>
      </text>

      {/* 4. Elegant Ornate Gold Filigree Marks in Corners */}
      <path d="M 28,150 C 20,170 20,230 28,250" stroke="url(#gold-bright)" strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />
      <path d="M 372,150 C 380,170 380,230 372,250" stroke="url(#gold-bright)" strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />

      {/* 5. Inner Royal Blue Shield */}
      <circle cx="200" cy="200" r="145" fill="url(#shield-blue)" stroke="url(#gold-bright)" strokeWidth="5.5" filter="url(#shadow-main)" />
      <circle cx="200" cy="200" r="136" stroke="rgba(254, 240, 138, 0.3)" strokeWidth="1" />

      {/* 6. Globe Grid Lines inside Shield */}
      <circle cx="200" cy="200" r="105" stroke="rgba(254, 240, 138, 0.15)" strokeWidth="1" fill="none" />
      <circle cx="200" cy="200" r="75" stroke="rgba(254, 240, 138, 0.12)" strokeWidth="1" fill="none" />
      <path d="M 200,55 A 145,145 0 0,0 200,345" stroke="rgba(254, 240, 138, 0.15)" strokeWidth="1" />
      <path d="M 55,200 A 145,145 0 0,0 345,200" stroke="rgba(254, 240, 138, 0.15)" strokeWidth="1" />

      {/* 7. Curved School Identity Text */}
      <text fill="url(#gold-bright)" fontFamily="Georgia, serif" fontSize="19.5" fontWeight="900" letterSpacing="0.8">
        <textPath href="#inner-top-path" startOffset="50%" textAnchor="middle">
          ROYAL COACHING CENTRE
        </textPath>
      </text>

      <text fill="url(#gold-bright)" fontFamily="Georgia, serif" fontSize="16.5" fontWeight="900" letterSpacing="0.8">
        <textPath href="#inner-bottom-path" startOffset="50%" textAnchor="middle">
          DILDARNAGAR, GHAZIPUR
        </textPath>
      </text>

      {/* 8. Gold Crown atop the Central R */}
      <g filter="url(#shadow-main)">
        <path 
          d="M 165,142 L 175,115 L 200,128 L 225,115 L 235,142 Z" 
          fill="url(#gold-bright)" 
          stroke="#854d0e" 
          strokeWidth="1.5" 
        />
        {/* Crown jewels */}
        <circle cx="200" cy="128" r="3.5" fill="#ef4444" stroke="#fff" strokeWidth="0.5" />
        <circle cx="175" cy="115" r="3" fill="#3b82f6" stroke="#fff" strokeWidth="0.5" />
        <circle cx="225" cy="115" r="3" fill="#3b82f6" stroke="#fff" strokeWidth="0.5" />
        <circle cx="187" cy="133" r="2" fill="#ef4444" />
        <circle cx="213" cy="133" r="2" fill="#3b82f6" />
      </g>

      {/* 9. Glossy Ruby-Red 3D letter "R" */}
      <g filter="url(#r-glow)">
        {/* Styled Letter "R" via combined visual paths */}
        {/* Outer Shadowed Shape */}
        <path 
          d="M 152,145 H 215 C 242,145 258,160 258,185 C 258,206 242,218 215,220 L 255,275 H 222 L 187,220 H 178 V 275 H 152 V 145 Z M 178,168 V 198 H 212 C 228,198 234,190 234,183 C 234,175 228,168 212,168 H 178 Z" 
          fill="url(#ruby-red)" 
          stroke="url(#gold-bright)" 
          strokeWidth="3.5" 
          strokeLinejoin="round"
        />
        {/* Shiny Highlight Layer inside "R" for glossy effect */}
        <path 
          d="M 156,149 H 211 C 236,149 250,162 250,183 C 250,201 236,212 211,214 L 156,149 Z" 
          fill="rgba(255,255,255,0.15)" 
          pointerEvents="none"
        />
      </g>

      {/* 10. Ornate Gold Plate & Contact Banner at the bottom */}
      <g filter="url(#shadow-main)">
        <rect x="70" y="316" width="260" height="36" rx="18" fill="url(#gold-banner)" stroke="#854d0e" strokeWidth="1.5" />
        
        {/* WhatsApp Icon */}
        <g transform="translate(82, 322)">
          <circle cx="12" cy="12" r="10.5" fill="#25d366" stroke="#fff" strokeWidth="1" />
          <path 
            d="M 8.5,15.5 L 9,15.3 C 9.5,15.6 10.2,15.8 11,15.8 C 13.1,15.8 14.8,14.1 14.8,12 C 14.8,9.9 13.1,8.2 11,8.2 C 8.9,8.2 7.2,9.9 7.2,12 C 7.2,12.8 7.4,13.5 7.8,14 L 7.5,15.5 L 8.5,15.5 Z" 
            fill="none" 
            stroke="#fff" 
            strokeWidth="1" 
          />
          <path 
            d="M 9.5,10.2 C 9.4,10 9.2,10 9.1,10 C 9,10 8.9,10.1 8.8,10.2 C 8.6,10.4 8.2,10.8 8.2,11.6 C 8.2,12.4 8.8,13.1 8.9,13.2 C 9,13.3 10.1,14.9 11.7,15.5 C 13,16 13.3,15.9 13.6,15.6 C 13.9,15.3 14.1,14.8 14.1,14.5 C 14.1,14.2 14,14 13.9,13.9 C 13.8,13.8 13.4,13.6 13.2,13.5 C 13,13.4 12.8,13.3 12.7,13.5 C 12.6,13.7 12.2,14.1 12.1,14.2 C 12,14.3 11.9,14.4 11.7,14.3 C 11.5,14.2 10.9,14 10.2,13.4 C 9.7,12.9 9.3,12.3 9.2,12.1 C 9.1,11.9 9.2,11.8 9.3,11.7 C 9.4,11.6 9.5,11.5 9.6,11.4 C 9.7,11.3 9.7,11.2 9.8,11.1 C 9.9,11 9.8,10.9 9.8,10.8 C 9.7,10.7 9.5,10.2 9.5,10.2 Z" 
            fill="#fff" 
          />
        </g>

        {/* Dynamic Contact Text */}
        <text x="112" y="339" fill="#1c0f05" fontFamily="monospace, monospace" fontSize="12" fontWeight="900" letterSpacing="0.4">
          9918833932, 9532462057
        </text>
      </g>
    </svg>
  );
}
