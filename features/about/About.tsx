import React, { useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  Download,
  ExternalLink,
  FileSignature,
  Smartphone,
  Wrench
} from 'lucide-react';
import QRCode from 'react-qr-code';

type AboutTab = 'instructions' | 'tools';

const About: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AboutTab>('instructions');
  const downloadLink = 'https://drive.google.com/uc?export=download&id=1-BEakzAcvjA41V-_o4JnBEFZL9zJi-P5';
  const caBatchSignerLink = 'https://drive.google.com/file/d/1mUQM8i69pHq3TPkcr8eHX0KAeE4V-7Kz/view?usp=sharing';
  const caBatchSignerGuideLink = 'https://docs.google.com/document/d/1QEcgUlIjZLXgT_ovyp0CjsKzw4lwtlNqINYPYe8CP1k/edit?tab=t.0';

  const tabButtonClass = (tab: AboutTab) =>
    `flex items-center gap-2 px-6 py-2.5 rounded-lg font-medium text-sm transition-all ${
      activeTab === tab
        ? 'bg-white text-indigo-600 shadow-sm'
        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
    }`;

  const workflowSteps = [
    {
      title: 'Sign in and confirm your role',
      summary: 'Start with the correct account so the menus and actions match your assignment.',
      actions: [
        'Admin users manage users, offices, events, reports, and certificate settings.',
        'Event managers prepare events, review participants, and generate event outputs.',
        'Scanners focus on attendance logging through Scan Mode or the mobile app.'
      ],
      outcome: 'The correct role prevents missing menus, restricted actions, and event access confusion.'
    },
    {
      title: 'Prepare offices, users, and certificate signatories',
      summary: 'Complete system settings before events begin, especially if certificates will be issued.',
      actions: [
        'Open Users to create or update staff accounts and assign their roles.',
        'Open Settings to select an office, add signatory details, and upload the e-signature.',
        'Mark the default signatory for each office that will issue certificates.'
      ],
      outcome: 'Reports and certificates will already have the correct office and signatory information.'
    },
    {
      title: 'Create the event record',
      summary: 'Every registration, scan, report, and certificate starts from the event setup.',
      actions: [
        'Open Events and create the event with the title, venue, start date, end date, and organizer.',
        'Set the event status and registration availability based on the actual workflow.',
        'Configure sessions, accommodation, and food inclusion when those details apply.'
      ],
      outcome: 'The event becomes available for registration, attendance, and reporting workflows.'
    },
    {
      title: 'Open registration and collect participants',
      summary: 'Use the event registration link to gather participant records before scanning begins.',
      actions: [
        'Share the public registration link with the target participants.',
        'Ask participants to complete their name, office or LGU, position, contact, and required event details.',
        'Review participant entries before the activity date to catch duplicates or incomplete information.'
      ],
      outcome: 'Participants receive QR-ready records that can be used for attendance and reports.'
    },
    {
      title: 'Scan attendance during the event',
      summary: 'Use QR scanning to record attendance per event date and session.',
      actions: [
        'Open Scan Mode or use the Android mobile app from the Tools tab.',
        'Select the correct event and session before scanning participant QR codes.',
        'Watch for duplicate, invalid, or late scan notices and correct the selected event or session when needed.'
      ],
      outcome: 'Attendance logs are captured with the correct event, participant, date, and session.'
    },
    {
      title: 'Monitor and verify records',
      summary: 'Check attendance and participant history before producing official outputs.',
      actions: [
        'Use Attendance to review scanned participants and attendance status.',
        'Use Lookup to search a participant name or scan a QR code and verify event history.',
        'Resolve obvious missing or incorrect records before printing reports.'
      ],
      outcome: 'The event record is cleaner before reports and certificates are generated.'
    },
    {
      title: 'Generate reports and certificates',
      summary: 'Produce attendance sheets, scan logs, and certificates after validating the event data.',
      actions: [
        'Open Reports and choose the event output needed by the office.',
        'Generate attendance sheets or scan logs for documentation.',
        'Generate Certificates of Appearance or Participation using the configured office signatory.'
      ],
      outcome: 'Official event documents are based on validated registration and attendance records.'
    },
    {
      title: 'Download companion tools when needed',
      summary: 'Use the Tools tab for devices or certificate signing workflows outside the portal.',
      actions: [
        'Download the Android app for scanner devices that need mobile attendance logging.',
        'Download CA Batch Signer for PNKI Signature when certificates need external batch signing.',
        'Open the CA Batch Signer guide before signing certificates for the first time.'
      ],
      outcome: 'Field scanning and certificate signing can continue using the approved companion tools.'
    }
  ];

  return (
    <div className="h-full min-h-0 overflow-y-auto pr-1 w-full space-y-8 pb-12">
      <div className="flex space-x-1 bg-slate-100/50 p-1 rounded-xl w-fit">
        <button
          type="button"
          onClick={() => setActiveTab('instructions')}
          className={tabButtonClass('instructions')}
        >
          <BookOpen size={18} />
          How to Use
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('tools')}
          className={tabButtonClass('tools')}
        >
          <Wrench size={18} />
          Tools
        </button>
      </div>

      {activeTab === 'instructions' ? (
        <div className="space-y-8">
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full text-sm font-medium mb-4">
              <BookOpen size={16} />
              <span>User Guide</span>
            </div>
            <h1 className="text-3xl font-bold text-slate-900 mb-4">Step-by-Step System Workflow</h1>
            <p className="text-slate-600 leading-relaxed text-lg">
              Follow this sequence to prepare an event, register participants, scan attendance, verify records, and generate official outputs.
            </p>
            <div className="mt-6 grid grid-cols-1 gap-3 text-sm text-slate-600 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="font-semibold text-slate-800">Setup</p>
                <p className="mt-1">Users, offices, events, and certificate signatories.</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="font-semibold text-slate-800">Registration</p>
                <p className="mt-1">Participant records and QR-ready identities.</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="font-semibold text-slate-800">Attendance</p>
                <p className="mt-1">Scan sessions, duplicate checks, and history review.</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="font-semibold text-slate-800">Outputs</p>
                <p className="mt-1">Reports, certificates, and companion signing tools.</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5">
            {workflowSteps.map((step, index) => (
              <div key={step.title} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center font-bold text-lg shrink-0">
                    {index + 1}
                  </div>
                  <div className="min-w-0 flex-1 space-y-3">
                    <div>
                      <h2 className="text-xl font-bold text-slate-800 mt-1">{step.title}</h2>
                      <p className="mt-1 text-slate-600">{step.summary}</p>
                    </div>
                    <ul className="space-y-2 text-slate-600">
                      {step.actions.map((action) => (
                        <li key={action} className="flex items-start gap-2">
                          <CheckCircle2 size={18} className="text-indigo-500 mt-0.5 shrink-0" />
                          <span>{action}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-800">
                      <span className="font-semibold">Result:</span> {step.outcome}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full text-sm font-medium mb-4">
              <Wrench size={16} />
              <span>Tools</span>
            </div>
            <h1 className="text-3xl font-bold text-slate-900 mb-4">Portal Tools and Downloads</h1>
            <p className="text-slate-600 leading-relaxed text-lg">
              Download companion utilities used with the Regional Event and Attendance Management System. Use the QR codes for quick access from mobile or shared devices.
            </p>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-stretch">
                <div className="flex-1 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center shrink-0">
                      <Smartphone size={22} />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-slate-800">Download Mobile App</h2>
                      <p className="text-sm text-slate-500">Android scanner companion app</p>
                    </div>
                  </div>
                  <p className="text-sm leading-relaxed text-slate-600">
                    Install the Android APK on scanning devices for QR-based attendance logging and mobile event operations.
                  </p>
                  <div className="space-y-2">
                    <a
                      href={downloadLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
                    >
                      <Download size={18} />
                      Android APK
                    </a>
                    <button
                      type="button"
                      disabled
                      className="inline-flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-lg bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-400"
                    >
                      <Smartphone size={18} />
                      iOS (Coming Soon)
                    </button>
                  </div>
                </div>

                <div className="flex w-full flex-col items-center justify-center rounded-2xl bg-indigo-50 p-5 text-center lg:w-[180px]">
                  <div className="bg-white p-3 rounded-xl shadow-sm">
                    <QRCode value={downloadLink} size={116} />
                  </div>
                  <p className="mt-3 text-xs font-medium text-indigo-900">Scan to download</p>
                </div>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-stretch">
                <div className="flex-1 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center shrink-0">
                      <FileSignature size={22} />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-slate-800">CA Batch Signer for PNKI Signature</h2>
                      <p className="text-sm text-slate-500">Certificate of Appearance signing utility</p>
                    </div>
                  </div>
                  <p className="text-sm leading-relaxed text-slate-600">
                    Download the Windows utility for batch signing Certificate of Appearance files, then open the guide for the signing workflow and usage notes.
                  </p>
                  <div className="space-y-2">
                    <a
                      href={caBatchSignerLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
                    >
                      <Download size={18} />
                      Download CA Batch Signer for PNKI Signature
                    </a>
                    <a
                      href={caBatchSignerGuideLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
                    >
                      <ExternalLink size={18} />
                      How to Use CA Batch Signer for PNKI Signature
                    </a>
                  </div>
                </div>

                <div className="flex w-full flex-col items-center justify-center rounded-2xl bg-emerald-50 p-5 text-center lg:w-[180px]">
                  <div className="bg-white p-3 rounded-xl shadow-sm">
                    <QRCode value={caBatchSignerLink} size={116} />
                  </div>
                  <p className="mt-3 text-xs font-medium text-emerald-900">Scan to download</p>
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
