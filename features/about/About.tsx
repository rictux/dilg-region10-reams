import React, { useState } from 'react';
import { Download, Smartphone, Info, Calendar, Users, BarChart2, Shield, Github, BookOpen, CheckCircle2 } from 'lucide-react';
import QRCode from 'react-qr-code';

const About: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'about' | 'instructions'>('about');
  const downloadLink = 'https://drive.google.com/uc?export=download&id=1-BEakzAcvjA41V-_o4JnBEFZL9zJi-P5';
  const githubLink = 'https://github.com/iamrudyard/Event-Portal/';

  return (
    <div className="h-full min-h-0 overflow-y-auto pr-1 w-full space-y-8 pb-12">
      <div className="flex space-x-1 bg-slate-100/50 p-1 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab('about')}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-lg font-medium text-sm transition-all ${
            activeTab === 'about'
              ? 'bg-white text-indigo-600 shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
          }`}
        >
          <Info size={18} />
          About the System
        </button>
        <button
          onClick={() => setActiveTab('instructions')}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-lg font-medium text-sm transition-all ${
            activeTab === 'instructions'
              ? 'bg-white text-indigo-600 shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
          }`}
        >
          <BookOpen size={18} />
          How to Use
        </button>
      </div>

      {activeTab === 'about' ? (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col lg:flex-row gap-6 items-stretch">
            <div className="flex-1 space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full text-sm font-medium">
                <Info size={16} />
                <span>About the System</span>
              </div>
              <div className="space-y-3">
                <h1 className="text-3xl font-bold text-slate-900">Regional Event & Attendance Management System</h1>
                <p className="text-slate-600 leading-relaxed">
                  A full-stack event and attendance platform for government and institutional workflows, covering event setup, registration, QR attendance, reporting, certificate generation, and signatory management.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Menu</p>
                  <p className="mt-2 text-sm font-medium text-slate-800">Overview, Events, Attendance, Lookup, Reports, Scan Mode, Users</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">System</p>
                  <p className="mt-2 text-sm font-medium text-slate-800">About and Settings pages for help and certificate configuration</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Certificates</p>
                  <p className="mt-2 text-sm font-medium text-slate-800">Office-based signatory setup with template variants and e-signatures</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Storage</p>
                  <p className="mt-2 text-sm font-medium text-slate-800">Profile images in `img`, signatory files in `esig`</p>
                </div>
              </div>
              <div>
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

            <div className="w-full lg:w-[320px] flex justify-center">
              <div className="bg-indigo-50 p-5 rounded-2xl flex flex-col items-center text-center space-y-3 w-full">
                <h3 className="font-bold text-indigo-900">Download Mobile App</h3>
                <div className="bg-white p-3 rounded-xl shadow-sm">
                  <QRCode value={downloadLink} size={108} />
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

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center shrink-0">
                  <Calendar size={22} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-800">Event and Registration</h2>
                  <p className="text-sm text-slate-500">Core setup and participant workflows</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-slate-600">
                <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
                  <p className="font-semibold text-slate-800">Overview</p>
                  <p className="mt-1">Monitor event counts, activity snapshots, and summary information.</p>
                </div>
                <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
                  <p className="font-semibold text-slate-800">Events</p>
                  <p className="mt-1">Manage schedules, venues, organizers, registration, and accommodation settings.</p>
                </div>
                <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
                  <p className="font-semibold text-slate-800">Registration</p>
                  <p className="mt-1">Accept public registrations and generate participant QR identities.</p>
                </div>
                <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
                  <p className="font-semibold text-slate-800">Participant Data</p>
                  <p className="mt-1">Store office or LGU, position, contact details, demographics, and attendance-ready records.</p>
                </div>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center shrink-0">
                  <Smartphone size={22} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-800">Attendance and Reports</h2>
                  <p className="text-sm text-slate-500">Scanning, lookup, and output tools</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-slate-600">
                <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
                  <p className="font-semibold text-slate-800">Attendance</p>
                  <p className="mt-1">Track participants with QR-based logs and session-aware attendance records.</p>
                </div>
                <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
                  <p className="font-semibold text-slate-800">Scan Mode</p>
                  <p className="mt-1">Use mobile-friendly scanning with offline queue support and sync on reconnect.</p>
                </div>
                <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
                  <p className="font-semibold text-slate-800">Reports</p>
                  <p className="mt-1">Generate attendance sheets, scan logs, and certificate-related outputs.</p>
                </div>
                <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
                  <p className="font-semibold text-slate-800">Name Lookup</p>
                  <p className="mt-1">Search attendance history and participant event records from a single page.</p>
                </div>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center shrink-0">
                  <BarChart2 size={22} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-800">Certificates</h2>
                  <p className="text-sm text-slate-500">Office-based signatory and template controls</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-slate-600">
                <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
                  <p className="font-semibold text-slate-800">Signatory Setup</p>
                  <p className="mt-1">Maintain signatory name, position, and office-based certificate defaults.</p>
                </div>
                <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
                  <p className="font-semibold text-slate-800">E-Signature Upload</p>
                  <p className="mt-1">Upload signature images to the `esig` bucket for preview and print output.</p>
                </div>
                <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
                  <p className="font-semibold text-slate-800">Template Variants</p>
                  <p className="mt-1">Switch between layouts with visible or hidden certificate serial numbers.</p>
                </div>
                <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
                  <p className="font-semibold text-slate-800">Preview Workflow</p>
                  <p className="mt-1">Open the certificate preview in a modal before saving settings.</p>
                </div>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 bg-rose-50 text-rose-600 rounded-xl flex items-center justify-center shrink-0">
                  <Shield size={22} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-800">Administration</h2>
                  <p className="text-sm text-slate-500">Roles, navigation, and system controls</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-slate-600">
                <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
                  <p className="font-semibold text-slate-800">RBAC</p>
                  <p className="mt-1">Separate permissions for Admin, EventManager, and Scanner users.</p>
                </div>
                <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
                  <p className="font-semibold text-slate-800">Users</p>
                  <p className="mt-1">Create and maintain system accounts through the Users page.</p>
                </div>
                <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
                  <p className="font-semibold text-slate-800">Grouped Navigation</p>
                  <p className="mt-1">The sidebar is organized into `Menu` and `System` sections for easier access.</p>
                </div>
                <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
                  <p className="font-semibold text-slate-800">System Pages</p>
                  <p className="mt-1">Use About for guidance and Settings for signatory and certificate configuration.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full text-sm font-medium mb-4">
              <BookOpen size={16} />
              <span>User Guide</span>
            </div>
            <h1 className="text-3xl font-bold text-slate-900 mb-4">How to Use the System</h1>
            <p className="text-slate-600 leading-relaxed text-lg">
              This guide covers the current workflows in the portal, from event setup and registration to attendance, reporting, and certificate configuration.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center font-bold text-lg shrink-0">
                  1
                </div>
                <div className="space-y-3">
                  <h2 className="text-xl font-bold text-slate-800 mt-1">Create and Prepare an Event</h2>
                  <p className="text-slate-600">Set up the event first so registration, attendance, and reporting have a working source record.</p>
                  <ul className="space-y-2 text-slate-600">
                    <li className="flex items-start gap-2">
                      <CheckCircle2 size={18} className="text-indigo-500 mt-0.5 shrink-0" />
                      <span>Use <strong>Overview</strong> for a quick status summary, then open <strong>Events</strong> to create or update events.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 size={18} className="text-indigo-500 mt-0.5 shrink-0" />
                      <span>Fill in the event details such as title, venue, dates, organizer, and registration status.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 size={18} className="text-indigo-500 mt-0.5 shrink-0" />
                      <span>Enable registration and accommodation options as needed for the event workflow.</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center font-bold text-lg shrink-0">
                  2
                </div>
                <div className="space-y-3">
                  <h2 className="text-xl font-bold text-slate-800 mt-1">Register Participants</h2>
                  <p className="text-slate-600">Participants can register through the public event link while the system keeps their records ready for attendance and reporting.</p>
                  <ul className="space-y-2 text-slate-600">
                    <li className="flex items-start gap-2">
                      <CheckCircle2 size={18} className="text-indigo-500 mt-0.5 shrink-0" />
                      <span>Share the event registration link with attendees.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 size={18} className="text-indigo-500 mt-0.5 shrink-0" />
                      <span>Review participant data from attendance-related and report-related pages after registration.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 size={18} className="text-indigo-500 mt-0.5 shrink-0" />
                      <span>The system generates QR codes that can later be used for scan-based attendance.</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center font-bold text-lg shrink-0">
                  3
                </div>
                <div className="space-y-3">
                  <h2 className="text-xl font-bold text-slate-800 mt-1">Scan Attendance</h2>
                  <p className="text-slate-600">Use QR-based attendance with support for mobile devices and offline queueing.</p>
                  <ul className="space-y-2 text-slate-600">
                    <li className="flex items-start gap-2">
                      <CheckCircle2 size={18} className="text-indigo-500 mt-0.5 shrink-0" />
                      <span>Open <strong>Scan Mode</strong> and select the event and session.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 size={18} className="text-indigo-500 mt-0.5 shrink-0" />
                      <span>Scan participant QR codes to log attendance.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 size={18} className="text-indigo-500 mt-0.5 shrink-0" />
                      <span>If connectivity drops, keep scanning. The queue syncs automatically once the device reconnects.</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center font-bold text-lg shrink-0">
                  4
                </div>
                <div className="space-y-3">
                  <h2 className="text-xl font-bold text-slate-800 mt-1">Generate Reports and Certificates</h2>
                  <p className="text-slate-600">Use the reporting tools for attendance documentation, lookup, and certificate workflows.</p>
                  <ul className="space-y-2 text-slate-600">
                    <li className="flex items-start gap-2">
                      <CheckCircle2 size={18} className="text-indigo-500 mt-0.5 shrink-0" />
                      <span>Open <strong>Reports</strong> to generate attendance sheets, scan logs, and certificate-related outputs.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 size={18} className="text-indigo-500 mt-0.5 shrink-0" />
                      <span>Use <strong>Name Lookup</strong> to search attendance history and validate participation records.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 size={18} className="text-indigo-500 mt-0.5 shrink-0" />
                      <span>Admins can open <strong>Settings</strong> to configure office signatories, upload e-signatures, and choose the active certificate variant.</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default About;
