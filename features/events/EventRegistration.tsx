
import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Event, Participant, RefLocation } from '../../types/database';
import QRCode from 'react-qr-code';
import { CheckCircle, Calendar, MapPin, User, Mail, Briefcase, Building, Loader2, Phone, Heart, Users, Home, AlertCircle, Lock, Landmark, Download, Info } from 'lucide-react';
import { format, isSameMonth, isSameYear, parseISO } from 'date-fns';
import { toPng } from 'html-to-image';
import QrScanner from './QrScanner';

const EventRegistration: React.FC = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showQrScanner, setShowQrScanner] = useState(false);
  
  // Ref for saving image
  const ticketRef = useRef<HTMLDivElement>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  // Location / Office State
  const [locations, setLocations] = useState<RefLocation[]>([]);
  const [affiliationType, setAffiliationType] = useState<'Office' | 'LGU'>('Office');
  const [selectedProvince, setSelectedProvince] = useState<string>('');
  const [selectedCity, setSelectedCity] = useState<string>('');

  // Consent State
  const [consent, setConsent] = useState(false);

  const formatEventDate = (start: string, end: string) => {
    if (!start) return 'TBD';
    const startDate = parseISO(start);
    const endDate = end ? parseISO(end) : startDate;

    if (start === end) {
        return format(startDate, 'MMMM d, yyyy');
    }

    if (isSameMonth(startDate, endDate) && isSameYear(startDate, endDate)) {
        return `${format(startDate, 'MMMM d')} - ${format(endDate, 'd, yyyy')}`;
    }

    if (!isSameMonth(startDate, endDate) && isSameYear(startDate, endDate)) {
        return `${format(startDate, 'MMMM d')} - ${format(endDate, 'MMMM d, yyyy')}`;
    }

    return `${format(startDate, 'MMMM d, yyyy')} - ${format(endDate, 'MMMM d, yyyy')}`;
  };

  const [formData, setFormData] = useState({
    f_name: '',
    l_name: '',
    m_initial: '',
    suffix: '',
    full_name: '', // We'll keep this to store the returned full_name from backend
    email: '',
    gender: 'Male',
    position: '',
    office: '',
    mobile_no: '',
    age_group: '18-24',
    pwd: 'No',
    indigenous_people: 'No',
    role: 'Delegate',
    needs_accommodation: false,
    accommodation_pax: 0,
    location_id: null as number | null,
    accept_photo_video: false,
    store_to_db: false,
    participant_code: ''
  });

  useEffect(() => {
    fetchEventDetails();
    fetchLocations();
  }, [eventId]);

  const fetchEventDetails = async () => {
    if (!eventId) return;
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('event_id', parseInt(eventId))
      .single();
    
    if (error || !data) {
      setError("Event not found or has been cancelled.");
    } else {
      setEvent(data);
    }
    setLoading(false);
  };

  const fetchLocations = async () => {
    const { data } = await supabase
        .from('ref_locations')
        .select('*')
        .order('province_huc', { ascending: true })
        .order('city_mun', { ascending: true });
    
    if (data) {
        setLocations(data);
    }
  };

  const toProperCase = (str: string) => {
    return str.toLowerCase().replace(/(^|\s)\S/g, l => l.toUpperCase());
  };

  const normalizeNamePart = (value: string) => value.trim().toLowerCase();
  const normalizeMiddleInitial = (value?: string | null) => (value || '').trim().toUpperCase();

  const handleQrScanSuccess = async (decodedText: string) => {
    setShowQrScanner(false);
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('participants')
        .select('*')
        .eq('participant_code', decodedText)
        .single();

      if (error || !data) {
        setError("QR Code invalid or participant not found.");
      } else {
        setFormData(prev => ({
          ...prev,
          f_name: data.f_name || '',
          l_name: data.l_name || '',
          m_initial: data.m_initial || '',
          suffix: data.suffix || '',
          email: data.email || '',
          gender: data.gender || 'Male',
          position: data.position || '',
          office: data.office || '',
          mobile_no: data.mobile_no || '',
          age_group: data.age_group || '18-24',
          pwd: data.pwd || 'No',
          indigenous_people: data.indigenous_people || 'No',
          location_id: data.location_id,
          participant_code: data.participant_code || decodedText
        }));

        if (data.location_id) {
          const loc = locations.find(l => l.location_id === data.location_id);
          if (loc) {
            setAffiliationType('LGU');
            setSelectedProvince(loc.province_huc);
            setSelectedCity(loc.city_mun || '');
          } else {
            setAffiliationType('Office');
          }
        } else {
          setAffiliationType('Office');
        }
        setError(null);
      }
    } catch (err: any) {
      setError("Failed to fetch participant details.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!consent) {
        setError("You must accept the Data Privacy consent to proceed.");
        return;
    }

    // Validate Accommodation
    if (formData.needs_accommodation && formData.accommodation_pax < 1) {
        setError("Please specify at least 1 pax for accommodation.");
        return;
    }

    // Prepare Office / Location Data
    let finalLocationId = null;
    let finalOfficeName = formData.office;

    // ... (Your existing Location/Office Logic remains exactly the same here) ...
    if (affiliationType === 'LGU') {
        if (!selectedProvince) {
            setError("Please select a Province/HUC for LGU.");
            return;
        }
        
        if (selectedCity) {
            const loc = locations.find(l => l.province_huc === selectedProvince && l.city_mun === selectedCity);
            if (loc) {
                finalLocationId = loc.location_id;
                finalOfficeName = `LGU ${selectedCity}, ${selectedProvince}`;
            } else {
                setError("Selected location is invalid.");
                return;
            }
        } else {
            const loc = locations.find(l => l.province_huc === selectedProvince && !l.city_mun);
            if (loc) {
                finalLocationId = loc.location_id;
            }
            if (selectedProvince.toLowerCase().includes('city')) {
                 finalOfficeName = `LGU ${selectedProvince}`;
            } else {
                 finalOfficeName = `Provincial Gov't of ${selectedProvince}`;
            }
        }
    } else {
        if (!formData.office.trim()) {
            setError("Please enter your Office / Agency name.");
            return;
        }
    }

    // ---------------------------------------------------------
    //  STEP 1: SANITIZE DATA (Empty String -> NULL)
    // ---------------------------------------------------------
    // If the trimmed string is empty, set it to null. Otherwise, use the trimmed value.
    const finalEmail = formData.email.trim() === '' ? null : formData.email.trim();
    const finalMobile = formData.mobile_no.trim() === '' ? null : formData.mobile_no.trim();

    setSubmitting(true);
    setError(null);
    setAlreadyRegistered(false);
    
    try {
        if (!event) throw new Error("Event not loaded");
        if (!event.registration_open) throw new Error("Registration for this event is closed.");
        
        const id = parseInt(eventId!);

        // 1. Check if participant exists by email or mobile
        let participantId: number;
        let finalParticipantCode: string = '';

        // NOTE: If searching by email, ensure we don't search for NULL or empty string
        // If email is provided, search by it.
        let existingUser = null;
        
        if (formData.participant_code) {
             const { data } = await supabase
                .from('participants')
                .select('participant_id, participant_code')
                .eq('participant_code', formData.participant_code)
                .limit(1)
                .maybeSingle();
             existingUser = data;
        }

        if (!existingUser && finalEmail) {
             const { data } = await supabase
                .from('participants')
                .select('participant_id, participant_code')
                .eq('email', finalEmail)
                .limit(1)
                .maybeSingle();
             existingUser = data;
        }

        if (!existingUser && finalMobile) {
             const { data } = await supabase
                .from('participants')
                .select('participant_id, participant_code')
                .eq('mobile_no', finalMobile)
                .limit(1)
                .maybeSingle();
             existingUser = data;
        }

        if (!existingUser) {
             const normalizedFirstName = normalizeNamePart(formData.f_name);
             const normalizedLastName = normalizeNamePart(formData.l_name);
             const targetMiddleInitial = normalizeMiddleInitial(formData.m_initial);

             const { data } = await supabase
                .from('participants')
                .select('participant_id, participant_code, f_name, l_name, m_initial')
                .ilike('f_name', formData.f_name.trim())
                .ilike('l_name', formData.l_name.trim())
                .limit(10);

             existingUser = (data || []).find((participant) =>
                normalizeNamePart(participant.f_name || '') === normalizedFirstName &&
                normalizeNamePart(participant.l_name || '') === normalizedLastName &&
                normalizeMiddleInitial(participant.m_initial) === targetMiddleInitial
             ) || null;
        }

        if (existingUser) {
            participantId = existingUser.participant_id;
            finalParticipantCode = existingUser.participant_code;
            
            // Update existing participant details
            // ---------------------------------------------------------
            // STEP 2: USE SANITIZED VARIABLES IN UPDATE
            // ---------------------------------------------------------
            const { data: updatedUser, error: updateError } = await supabase.from('participants').update({
                f_name: toProperCase(formData.f_name.trim()),
                l_name: toProperCase(formData.l_name.trim()),
                m_initial: formData.m_initial.trim() === '' ? null : formData.m_initial.trim().toUpperCase(),
                suffix: formData.suffix.trim() === '' ? null : toProperCase(formData.suffix.trim()),
                email: finalEmail,
                gender: formData.gender,
                position: formData.position,
                office: finalOfficeName,
                location_id: finalLocationId,
                mobile_no: finalMobile, // <--- Used here
                age_group: formData.age_group,
                pwd: formData.pwd,
                indigenous_people: formData.indigenous_people
            }).eq('participant_id', participantId)
            .select()
            .single();

            if (updateError) throw updateError;
            setFormData(prev => ({ ...prev, full_name: updatedUser.full_name || '' }));

        } else {
            // Create new participant
            // ---------------------------------------------------------
            // STEP 3: USE SANITIZED VARIABLES IN INSERT
            // ---------------------------------------------------------
            const { data: newUser, error: createError } = await supabase
                .from('participants')
                .insert([{
                    f_name: toProperCase(formData.f_name.trim()),
                    l_name: toProperCase(formData.l_name.trim()),
                    m_initial: formData.m_initial.trim() === '' ? null : formData.m_initial.trim().toUpperCase(),
                    suffix: formData.suffix.trim() === '' ? null : toProperCase(formData.suffix.trim()),
                    email: finalEmail,       // <--- Used here
                    mobile_no: finalMobile,  // <--- Used here
                    gender: formData.gender,
                    position: formData.position,
                    office: finalOfficeName,
                    location_id: finalLocationId,
                    age_group: formData.age_group,
                    pwd: formData.pwd,
                    indigenous_people: formData.indigenous_people
                }])
                .select()
                .single();
            
            if (createError) throw createError;
            participantId = newUser.participant_id;
            finalParticipantCode = newUser.participant_code;
            setFormData(prev => ({ ...prev, full_name: newUser.full_name || '' }));
        }

        // 2. Register for Event
        const { error: regError } = await supabase
            .from('event_participants')
            .insert({
                event_id: id,
                participant_id: participantId,
                registration_status: 'Registered',
                role: 'Delegate',
                needs_accommodation: formData.needs_accommodation,
                accommodation_pax: formData.needs_accommodation ? formData.accommodation_pax : 0,
                accept_photo_video: formData.accept_photo_video,
                store_to_db: formData.store_to_db
            });

        if (regError) {
            if (regError.code === '23505') {
                setAlreadyRegistered(true);
            } else {
                throw regError;
            }
        }

        setQrToken(finalParticipantCode);
        setSuccess(true);

    } catch (err: any) {
        setError(err.message || "Registration failed. Please try again.");
    } finally {
        setSubmitting(false);
    }
  };

  const handleDownload = async () => {
    if (!ticketRef.current) return;
    setIsDownloading(true);
    try {
        const dataUrl = await toPng(ticketRef.current, { cacheBust: true, backgroundColor: '#ffffff' });
        
        const link = document.createElement('a');
        link.download = `${event?.event_name.substring(0, 20).replace(/\s+/g, '_')}_${formData.full_name.replace(/\s+/g, '_')}_Pass.png`;
        link.href = dataUrl;
        link.click();
    } catch (err) {
        console.error("Failed to save image", err);
        alert("Failed to save image. Please screenshot instead.");
    } finally {
        setIsDownloading(false);
    }
  };

  // Helper to get unique provinces
  const provinces = Array.from(new Set(locations.map(l => l.province_huc))).sort();
  
  // Helper to get cities based on selected province (Filter out nulls/empty)
  const cities = locations
    .filter(l => l.province_huc === selectedProvince && l.city_mun)
    .map(l => l.city_mun as string)
    .sort();

  if (loading) {
      return (
          <div className="min-h-screen flex items-center justify-center bg-slate-50">
              <Loader2 className="animate-spin text-indigo-600" size={32} />
          </div>
      );
  }

  if (!event) {
      return (
          <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
              <div className="bg-white p-8 rounded-xl shadow-md text-center max-w-md w-full">
                  <div className="text-red-500 mb-4 flex justify-center"><CheckCircle size={48} className="rotate-45" /></div>
                  <h2 className="text-xl font-bold text-slate-800 mb-2">Event Not Found</h2>
                  <p className="text-slate-500">{error || "The event link might be invalid or expired."}</p>
              </div>
          </div>
      );
  }

  // Registration Closed Screen
  if (!event.registration_open) {
    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
              <div className="bg-white p-8 rounded-xl shadow-md text-center max-w-md w-full border border-slate-100">
                  <div className="bg-red-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Lock size={32} className="text-red-500" />
                  </div>
                  <h2 className="text-xl font-bold text-slate-800 mb-2">Registration Closed</h2>
                  <p className="text-slate-500">
                      Registration for <strong className="text-slate-700">{event.event_name}</strong> is currently closed.
                  </p>
                  <div className="mt-6 pt-6 border-t border-slate-100">
                    <p className="text-slate-400 text-xs uppercase font-medium mb-1">Contact Organizer</p>
                    <p className="text-indigo-600 font-medium text-sm">Please contact the event organizer for assistance.</p>
                  </div>
              </div>
          </div>
    );
  }

  if (success && qrToken) {
      return (
          <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 flex justify-center">
              <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden">
                  <div className={`${alreadyRegistered ? 'bg-amber-500' : 'bg-green-600'} px-6 py-8 text-center text-white transition-colors`}>
                      <div className="flex justify-center mb-4">
                          <div className="bg-white/20 p-3 rounded-full">
                              {alreadyRegistered ? (
                                <Info size={48} className="text-white" />
                              ) : (
                                <CheckCircle size={48} className="text-white" />
                              )}
                          </div>
                      </div>
                      <h2 className="text-3xl font-bold mb-2">
                          {alreadyRegistered ? 'Already Registered' : 'Registration Confirmed!'}
                      </h2>
                      <p className={`${alreadyRegistered ? 'text-amber-100' : 'text-green-100'}`}>
                          {alreadyRegistered 
                            ? 'You are already on the list for:' 
                            : 'See you at'
                          } <br/>
                          <span className="font-semibold">{event.event_name}</span>
                      </p>
                  </div>
                  
                  <div className="p-8 flex flex-col items-center text-center">
                      <p className="text-slate-600 mb-6">
                          Please save this QR code. Present it at the venue entrance for attendance scanning.
                      </p>
                      
                      {/* Ticket / Pass Container for Image Generation */}
                      <div 
                        ref={ticketRef}
                        className="bg-white p-6 rounded-xl w-full border-2 border-slate-100"
                      >
                          <div className="border-4 border-slate-900 p-4 rounded-xl mb-4 bg-white inline-block">
                              <QRCode value={qrToken} size={180} />
                          </div>

                          <div className="w-full text-center">
                              <p className="font-bold text-slate-900 text-xl">{formData.full_name}</p>
                              <p className="text-indigo-600 font-semibold">{formData.position}</p>
                              
                              <div className="mt-1 flex items-center justify-center gap-1.5 text-slate-500 text-sm">
                                 {affiliationType === 'LGU' ? <Landmark size={14} /> : <Building size={14} />}
                                 <span>
                                     {affiliationType === 'LGU' && selectedCity 
                                        ? `LGU ${selectedCity}, ${selectedProvince}`
                                        : affiliationType === 'LGU' && selectedProvince
                                        ? (selectedProvince.toLowerCase().includes('city') ? `LGU ${selectedProvince}` : `Provincial Gov't of ${selectedProvince}`)
                                        : formData.office
                                     }
                                 </span>
                              </div>
                              <p className="text-[10px] text-slate-300 font-mono mt-3 uppercase tracking-widest">{qrToken}</p>
                          </div>
                      </div>
                      
                      <button 
                        onClick={handleDownload} 
                        disabled={isDownloading}
                        className="mt-8 w-full bg-slate-900 text-white py-3.5 rounded-xl font-bold hover:bg-slate-800 transition-colors flex items-center justify-center gap-2 shadow-lg active:scale-[0.98]"
                      >
                          {isDownloading ? <Loader2 className="animate-spin" /> : <Download size={20} />}
                          {isDownloading ? 'Saving...' : 'Save QR Code'}
                      </button>
                  </div>
              </div>
          </div>
      );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8 sm:py-12 px-4 sm:px-6 lg:px-8 flex justify-center">
        <div className="max-w-3xl w-full bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-100">
            {/* Event Header */}
            <div className="bg-indigo-600 p-6 sm:p-8 text-white relative overflow-hidden">
                <div className="relative z-10">
                    <span className="inline-block px-2 py-1 bg-white/20 rounded text-xs font-semibold mb-3">Registration Open</span>
                    <h1 className="text-2xl sm:text-3xl font-bold mb-2">{event.event_name}</h1>
                    <div className="flex flex-col gap-2 mt-4 text-indigo-100 text-sm font-medium">
                        <div className="flex items-center gap-2">
                            <Calendar size={16} />
                            <span>{formatEventDate(event.start_date, event.end_date)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <MapPin size={16} />
                            <span>{event.venue}</span>
                        </div>
                    </div>
                </div>
                {/* Decorative circle */}
                <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-2xl"></div>
            </div>

            {/* Form */}
            <div className="p-6 sm:p-8">
                {error && (
                    <div className="mb-6 bg-red-50 border-l-4 border-red-500 p-4 text-red-700 text-sm rounded">
                        {error}
                    </div>
                )}
                
                <div className="mb-6 bg-indigo-50 border border-indigo-100 p-4 rounded-lg flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="text-sm text-indigo-800">
                        <strong>Already have a QR code?</strong> Click 'Scan' to quickly fill out this form.
                    </div>
                    <button
                        type="button"
                        onClick={() => setShowQrScanner(!showQrScanner)}
                        className="whitespace-nowrap bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
                    >
                        {showQrScanner ? 'Close Scanner' : 'Scan'}
                    </button>
                </div>

                {showQrScanner && (
                    <div className="mb-6 p-4 border border-slate-200 rounded-lg bg-slate-50">
                        <QrScanner 
                            onScanSuccess={handleQrScanSuccess} 
                            onScanFailure={(err) => console.log(err)} 
                        />
                        <p className="text-xs text-center text-slate-500 mt-2">Position the QR code within the frame to scan.</p>
                    </div>
                )}
                
                <form onSubmit={handleSubmit} className="space-y-5">
                    
                    {/* SECTION: Personal Info */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider border-b pb-2 mb-4">Personal Information</h3>
                        
                        {formData.participant_code && (
                            <div className="mb-4 p-3 bg-indigo-50 border border-indigo-100 rounded-lg flex items-center gap-3">
                                <CheckCircle className="text-indigo-600" size={20} />
                                <div>
                                    <p className="text-xs text-indigo-600 font-semibold uppercase">Scanned Participant Code</p>
                                    <p className="text-sm font-medium text-slate-800">{formData.participant_code}</p>
                                </div>
                            </div>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="relative">
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">First Name</label>
                                <div className="relative">
                                    <User className="absolute left-3 top-3 text-slate-400" size={18} />
                                    <input 
                                        required 
                                        type="text"
                                        className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                                        placeholder="First Name"
                                        value={formData.f_name}
                                        onChange={(e) => setFormData({ ...formData, f_name: e.target.value })}
                                        onBlur={(e) => setFormData({ ...formData, f_name: toProperCase(e.target.value) })}
                                        autoComplete="off"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">Last Name</label>
                                <div className="relative">
                                    <User className="absolute left-3 top-3 text-slate-400" size={18} />
                                    <input 
                                        required 
                                        type="text"
                                        className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                                        placeholder="Last Name"
                                        value={formData.l_name}
                                        onChange={(e) => setFormData({ ...formData, l_name: e.target.value })}
                                        onBlur={(e) => setFormData({ ...formData, l_name: toProperCase(e.target.value) })}
                                        autoComplete="off"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">Middle Initial</label>
                                <input 
                                    type="text"
                                    maxLength={1}
                                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                                    placeholder="e.g. A"
                                    value={formData.m_initial}
                                    onChange={e => setFormData({...formData, m_initial: e.target.value.toUpperCase()})}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">Suffix (Jr, Sr, III)</label>
                                <input 
                                    type="text"
                                    maxLength={10}
                                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                                    placeholder="e.g. Jr (if none leave blank)"
                                    value={formData.suffix}
                                    onChange={e => setFormData({...formData, suffix: e.target.value})}
                                    onBlur={e => setFormData({...formData, suffix: toProperCase(e.target.value)})}
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">Email Address</label>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-3 text-slate-400" size={18} />
                                    <input 
                                         type="email"
                                        className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                                        placeholder="john@company.com"
                                        value={formData.email}
                                        onChange={e => setFormData({...formData, email: e.target.value})}
                                    />
                                </div>
                            </div>
                             <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">Mobile No.</label>
                                <div className="relative">
                                    <Phone className="absolute left-3 top-3 text-slate-400" size={18} />
                                    <input 
                                        type="tel"
                                        className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                                        placeholder="09123456789"
                                        value={formData.mobile_no}
                                        onChange={e => setFormData({...formData, mobile_no: e.target.value.replace(/[^0-9]/g, '')})}
                                        maxLength={11}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">Gender</label>
                                <select 
                                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-white"
                                    value={formData.gender}
                                    onChange={e => setFormData({...formData, gender: e.target.value})}
                                >
                                    <option value="Male">Male</option>
                                    <option value="Female">Female</option>
                                    <option value="Other">Other</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">What age group do you belong?</label>
                                <select 
                                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-white"
                                    value={formData.age_group}
                                    onChange={e => setFormData({...formData, age_group: e.target.value})}
                                >
                                    <option value="18-24">18-24</option>
                                    <option value="25-34">25-34</option>
                                    <option value="35-44">35-44</option>
                                    <option value="45-54">45-54</option>
                                    <option value="55-65">55-65</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* SECTION: Demographics */}
                    <div className="space-y-4">
                         <div className="space-y-4">
                             <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5 leading-snug">
                                    Are you a person with disability (PWD), as defined under RA 7277 (Magna Carta for Persons with Disability)?
                                </label>
                                <select 
                                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-white"
                                    value={formData.pwd}
                                    onChange={e => setFormData({...formData, pwd: e.target.value})}
                                >
                                    <option value="No">No</option>
                                    <option value="Yes">Yes</option>
                                    <option value="Prefer not to say">Prefer not to say</option>
                                </select>
                            </div>
                             <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5 leading-snug">
                                    Do you identify as a member of an Indigenous Cultural Community / Indigenous People (ICCs/IPs)?
                                </label>
                                <select 
                                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-white"
                                    value={formData.indigenous_people}
                                    onChange={e => setFormData({...formData, indigenous_people: e.target.value})}
                                >
                                    <option value="No">No</option>
                                    <option value="Yes">Yes</option>
                                    <option value="Prefer not to say">Prefer not to say</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* SECTION: Professional Info */}
                    <div className="space-y-4">
                         <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider border-b pb-2 mb-4 pt-4">Professional Details</h3>
                         
                         <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1.5">Position / Title</label>
                            <div className="relative">
                                <Briefcase className="absolute left-3 top-3 text-slate-400" size={18} />
                                <input 
                                    required 
                                    type="text"
                                    className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                                    placeholder="Manager"
                                    value={formData.position}
                                    onChange={e => setFormData({...formData, position: e.target.value})}
                                />
                            </div>
                        </div>

                        {/* Office vs LGU Selection */}
                        <div className="pt-2">
                             <label className="block text-sm font-medium text-slate-700 mb-2">Affiliation Type</label>
                             <div className="flex gap-4 mb-4">
                                <label className={`flex-1 cursor-pointer border rounded-lg p-3 flex items-center gap-3 transition-all ${affiliationType === 'Office' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 hover:bg-slate-50'}`}>
                                    <input 
                                        type="radio" 
                                        className="hidden" 
                                        checked={affiliationType === 'Office'} 
                                        onChange={() => setAffiliationType('Office')}
                                    />
                                    <Building size={20} />
                                    <span className="font-medium">NGA / Office</span>
                                </label>
                                <label className={`flex-1 cursor-pointer border rounded-lg p-3 flex items-center gap-3 transition-all ${affiliationType === 'LGU' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 hover:bg-slate-50'}`}>
                                    <input 
                                        type="radio" 
                                        className="hidden" 
                                        checked={affiliationType === 'LGU'} 
                                        onChange={() => setAffiliationType('LGU')}
                                    />
                                    <Landmark size={20} />
                                    <span className="font-medium">LGU</span>
                                </label>
                             </div>

                             {affiliationType === 'Office' ? (
                                <div className="animate-in fade-in zoom-in-95 duration-200">
                                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Office / Agency Name</label>
                                    <div className="relative">
                                        <Building className="absolute left-3 top-3 text-slate-400" size={18} />
                                        <input 
                                            required={affiliationType === 'Office'}
                                            type="text"
                                            className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                                            placeholder="e.g. DILG Regional Office 10"
                                            value={formData.office}
                                            onChange={e => setFormData({...formData, office: e.target.value})}
                                        />
                                    </div>
                                </div>
                             ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-in fade-in zoom-in-95 duration-200">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1.5">Province / HUC</label>
                                        <div className="relative">
                                            <MapPin className="absolute left-3 top-3 text-slate-400" size={18} />
                                            <select 
                                                required={affiliationType === 'LGU'}
                                                className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-white appearance-none"
                                                value={selectedProvince}
                                                onChange={e => {
                                                    setSelectedProvince(e.target.value);
                                                    setSelectedCity('');
                                                }}
                                            >
                                                <option value="">-- Select Province --</option>
                                                {provinces.map(prov => (
                                                    <option key={prov} value={prov}>{prov}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1.5">City / Municipality</label>
                                        <div className="relative">
                                            <MapPin className="absolute left-3 top-3 text-slate-400" size={18} />
                                            <select 
                                                disabled={!selectedProvince}
                                                className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-white appearance-none disabled:bg-slate-100 disabled:text-slate-400"
                                                value={selectedCity}
                                                onChange={e => setSelectedCity(e.target.value)}
                                            >
                                                <option value="">-- Provincial / HUC Level (Optional) --</option>
                                                {cities.map(city => (
                                                    <option key={city} value={city}>{city}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                </div>
                             )}
                        </div>
                    </div>

                    {/* SECTION: Accommodation (Conditional) */}
                    {event.has_accommodation && (
                        <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-100 space-y-4 animate-in fade-in slide-in-from-top-4 duration-300">
                             <h3 className="text-sm font-bold text-indigo-800 uppercase tracking-wider flex items-center gap-2">
                                <Home size={16}/> Accommodation Request
                             </h3>
                             
                             <div>
                                <label className="block text-sm font-medium text-slate-800 mb-3 leading-snug">
                                    We offer accommodation during the entire duration of the event. Do you wish to avail this offer?
                                </label>
                                <div className="flex gap-6">
                                    <label className="flex items-center gap-2 cursor-pointer group">
                                        <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${formData.needs_accommodation ? 'border-indigo-600 bg-indigo-600' : 'border-slate-400 bg-white'}`}>
                                            {formData.needs_accommodation && <div className="w-2 h-2 rounded-full bg-white"></div>}
                                        </div>
                                        <input
                                            type="radio"
                                            name="accommodation"
                                            className="hidden"
                                            checked={formData.needs_accommodation}
                                            onChange={() => setFormData(prev => ({ ...prev, needs_accommodation: true, accommodation_pax: 1 }))}
                                        />
                                        <span className="text-sm font-medium text-slate-700 group-hover:text-indigo-700">Yes</span>
                                    </label>

                                    <label className="flex items-center gap-2 cursor-pointer group">
                                         <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${!formData.needs_accommodation ? 'border-indigo-600 bg-indigo-600' : 'border-slate-400 bg-white'}`}>
                                            {!formData.needs_accommodation && <div className="w-2 h-2 rounded-full bg-white"></div>}
                                        </div>
                                        <input
                                            type="radio"
                                            name="accommodation"
                                            className="hidden"
                                            checked={!formData.needs_accommodation}
                                            onChange={() => setFormData(prev => ({ ...prev, needs_accommodation: false, accommodation_pax: 0 }))}
                                        />
                                        <span className="text-sm font-medium text-slate-700 group-hover:text-indigo-700">No</span>
                                    </label>
                                </div>
                             </div>
                        </div>
                    )}

                    {/* Data Privacy Consent */}
                    <div className="flex flex-col gap-3 bg-slate-50 p-4 rounded-lg border border-slate-100 mt-4">
                        <div className="text-xs text-slate-600 leading-relaxed text-justify">
                            <strong>Privacy Notice</strong><br/>
                            DILG 10 Regional Office collects your data for event documentation, monitoring, and evaluation. Records are stored for one year. Photos and recordings may be captured for documentation or used in official publications.<br/>
                            To withdraw consent or report concerns, contact records.dilg10@gmail.com or the DILG Data Protection Officer at dpo.dilg@gmail.com.
                        </div>
                        
                        <div className="text-xs font-bold text-slate-700 mt-2">Consent:</div>

                        <div className="flex items-start gap-3">
                            <div className="flex items-center h-5">
                                <input
                                    id="consent-checkbox"
                                    type="checkbox"
                                    required
                                    checked={consent}
                                    onChange={(e) => setConsent(e.target.checked)}
                                    className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 cursor-pointer"
                                />
                            </div>
                            <label htmlFor="consent-checkbox" className="text-xs text-slate-700 font-bold leading-relaxed cursor-pointer">
                                I have read and agree to the Data Privacy Notice above. *
                            </label>
                        </div>
                        
                        <div className="flex items-start gap-3">
                            <div className="flex items-center h-5">
                                <input
                                    id="accept-photo-video"
                                    type="checkbox"
                                    checked={formData.accept_photo_video}
                                    onChange={(e) => setFormData({...formData, accept_photo_video: e.target.checked})}
                                    className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 cursor-pointer"
                                />
                            </div>
                            <label htmlFor="accept-photo-video" className="text-xs text-slate-600 leading-relaxed cursor-pointer">
                                I consent to the capture of my photo, video, and audio for use in DILG publications.
                            </label>
                        </div>

                        <div className="flex items-start gap-3">
                            <div className="flex items-center h-5">
                                <input
                                    id="store-to-db"
                                    type="checkbox"
                                    checked={formData.store_to_db}
                                    onChange={(e) => setFormData({...formData, store_to_db: e.target.checked})}
                                    className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 cursor-pointer"
                                />
                            </div>
                            <label htmlFor="store-to-db" className="text-xs text-slate-600 leading-relaxed cursor-pointer">
                                I consent to the storage of my data in the organizer’s database for future document processing.
                            </label>
                        </div>
                    </div>

                    <div className="pt-2">
                        <button 
                            type="submit" 
                            disabled={submitting || !consent}
                            className="w-full bg-indigo-600 text-white font-bold py-3 rounded-lg hover:bg-indigo-700 transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
                        >
                            {submitting && <Loader2 className="animate-spin" size={20} />}
                            {submitting ? 'Registering...' : 'Complete Registration'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    </div>
  );
};

export default EventRegistration;
