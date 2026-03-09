import React from 'react';
import { Download, Smartphone, Info, Calendar, Users, BarChart2, Shield, Github } from 'lucide-react';
import QRCode from 'react-qr-code';

const About: React.FC = () => {
  const downloadLink = "https://drive.google.com/uc?export=download&id=1-BEakzAcvjA41V-_o4JnBEFZL9zJi-P5";
  const githubLink = "https://github.com/iamrudyard/Event-Portal/";

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-12">
      {/* Header Section */}
      <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 flex flex-col md:flex-row gap-8 items-center">
        <div className="flex-1 space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full text-sm font-medium">
            <Info size={16} />
            <span>About the System</span>
          </div>
          <h1 className="text-3xl font-bold text-slate-900">Regional Event & Attendance Management System</h1>
          <p className="text-slate-600 leading-relaxed text-lg">
            A comprehensive, full-stack web application designed for managing corporate or government events, streamlining participant registration, and tracking attendance via QR codes with offline support.
          </p>
          <div className="pt-2">
            <a 
              href={githubLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800 transition-colors"
            >
              <Github size={18} />
              <span>View on GitHub</span>
            </a>
          </div>
        </div>
        <div className="w-full md:w-1/3 flex justify-center">
          <div className="bg-indigo-50 p-6 rounded-2xl flex flex-col items-center text-center space-y-4 w-full max-w-sm">
            <h3 className="font-bold text-indigo-900">Download Mobile App</h3>
            <div className="bg-white p-3 rounded-xl shadow-sm">
              <QRCode value={downloadLink} size={120} />
            </div>
            <div className="space-y-2 w-full">
              <a 
                href={downloadLink} 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full bg-indigo-600 text-white py-2.5 rounded-lg font-medium hover:bg-indigo-700 transition-colors"
              >
                <Download size={18} />
                <span>Android APK</span>
              </a>
              <button 
                disabled
                className="flex items-center justify-center gap-2 w-full bg-slate-100 text-slate-400 py-2.5 rounded-lg font-medium cursor-not-allowed"
              >
                <Smartphone size={18} />
                <span>iOS (Coming Soon)</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Features Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Event Management */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 space-y-4">
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center mb-4">
            <Calendar size={24} />
          </div>
          <h2 className="text-xl font-bold text-slate-800">📅 Event Management</h2>
          <ul className="space-y-3 text-slate-600">
            <li className="flex items-start gap-2">
              <span className="text-blue-500 mt-1">•</span>
              <span><strong>CRUD Operations:</strong> Create, update, and manage events with details like venue, date ranges, and status (Scheduled, Ongoing, Completed).</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-500 mt-1">•</span>
              <span><strong>Registration Controls:</strong> Toggle registration availability and accommodation options.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-500 mt-1">•</span>
              <span><strong>Dashboard:</strong> Real-time overview of active events, total participants, and visual calendar view.</span>
            </li>
          </ul>
        </div>

        {/* Participant & Registration */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 space-y-4">
          <div className="w-12 h-12 bg-green-50 text-green-600 rounded-xl flex items-center justify-center mb-4">
            <Users size={24} />
          </div>
          <h2 className="text-xl font-bold text-slate-800">👥 Participant & Registration</h2>
          <ul className="space-y-3 text-slate-600">
            <li className="flex items-start gap-2">
              <span className="text-green-500 mt-1">•</span>
              <span><strong>Public Registration:</strong> Public-facing page for attendees to self-register.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-500 mt-1">•</span>
              <span><strong>Digital ID:</strong> Auto-generation of unique QR Codes for every participant.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-500 mt-1">•</span>
              <span><strong>Badge Printing:</strong> Generate and download printable event badges with QR codes.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-500 mt-1">•</span>
              <span><strong>Role Management:</strong> Assign roles (Delegate, Speaker, Secretariat, VIP) to participants.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-500 mt-1">•</span>
              <span><strong>Demographics:</strong> Capture extensive data including office/LGU origin, gender, age group, and special needs.</span>
            </li>
          </ul>
        </div>

        {/* Attendance Tracking */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 space-y-4">
          <div className="w-12 h-12 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center mb-4">
            <Smartphone size={24} />
          </div>
          <h2 className="text-xl font-bold text-slate-800">📱 Attendance Tracking</h2>
          <ul className="space-y-3 text-slate-600">
            <li className="flex items-start gap-2">
              <span className="text-purple-500 mt-1">•</span>
              <span><strong>Mobile-First Scanner:</strong> Built-in QR scanner optimized for mobile devices.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-purple-500 mt-1">•</span>
              <span><strong>Offline Mode:</strong> Fully functional offline scanning queue. Data syncs automatically when the connection is restored.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-purple-500 mt-1">•</span>
              <span><strong>Session Tracking:</strong> Support for AM and PM attendance sessions.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-purple-500 mt-1">•</span>
              <span><strong>Duplicate Prevention:</strong> Prevents double scanning for the same session.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-purple-500 mt-1">•</span>
              <span><strong>Manual Entry:</strong> Fallback option to manually log attendance if QR scanning fails.</span>
            </li>
          </ul>
        </div>

        {/* Reports & Analytics */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 space-y-4">
          <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center mb-4">
            <BarChart2 size={24} />
          </div>
          <h2 className="text-xl font-bold text-slate-800">📊 Reports & Analytics</h2>
          <ul className="space-y-3 text-slate-600">
            <li className="flex items-start gap-2">
              <span className="text-amber-500 mt-1">•</span>
              <span><strong>Real-time Stats:</strong> Live counts of registered vs. present participants.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-amber-500 mt-1">•</span>
              <span><strong>Printable Reports:</strong> Attendance Sheets formatted specifically for government compliance (DILG format).</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-amber-500 mt-1">•</span>
              <span><strong>Scan Logs:</strong> Detailed audit trail of every scan timestamp and device.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-amber-500 mt-1">•</span>
              <span><strong>Name Lookup:</strong> Public and internal search tools to verify attendance history.</span>
            </li>
          </ul>
        </div>

        {/* Administration */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 space-y-4 md:col-span-2">
          <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-xl flex items-center justify-center mb-4">
            <Shield size={24} />
          </div>
          <h2 className="text-xl font-bold text-slate-800">🛡️ Administration</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ul className="space-y-3 text-slate-600">
              <li className="flex items-start gap-2">
                <span className="text-rose-500 mt-1">•</span>
                <span><strong>Role-Based Access Control (RBAC):</strong></span>
              </li>
              <li className="flex items-start gap-2 ml-6">
                <span className="text-slate-400 mt-1">-</span>
                <span><strong>Admin:</strong> Full system access, manage users, and offices.</span>
              </li>
              <li className="flex items-start gap-2 ml-6">
                <span className="text-slate-400 mt-1">-</span>
                <span><strong>Event Manager:</strong> Manage events, participants, and reports.</span>
              </li>
              <li className="flex items-start gap-2 ml-6">
                <span className="text-slate-400 mt-1">-</span>
                <span><strong>Scanner:</strong> Restricted access focused solely on the QR scanning interface.</span>
              </li>
            </ul>
            <ul className="space-y-3 text-slate-600">
              <li className="flex items-start gap-2">
                <span className="text-rose-500 mt-1">•</span>
                <span><strong>User Management:</strong> Create and manage system accounts.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-rose-500 mt-1">•</span>
                <span><strong>Office Management:</strong> Assign users to specific offices/agencies.</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* App Screenshot */}
      <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
        <h2 className="text-2xl font-bold text-slate-800 mb-6 text-center">Mobile App Interface</h2>
        <div className="flex justify-center">
          <img 
            src="/assets/mobile_app.jpg" 
            alt="Mobile App Screenshot" 
            className="rounded-xl shadow-lg max-w-full h-auto max-h-[600px] object-contain"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default About;
