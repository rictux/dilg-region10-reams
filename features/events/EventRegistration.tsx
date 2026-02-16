
import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Event, Participant, RefLocation } from '../../types/database';
import QRCode from 'react-qr-code';
import { CheckCircle, Calendar, MapPin, User, Mail, Briefcase, Building, Loader2, Phone, Heart, Users, Home, AlertCircle, Lock, Landmark, Download, Info } from 'lucide-react';
import { format } from 'date-fns';
// @ts-ignore
import html2canvas from 'html2canvas';

const EventRegistration: React.FC = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Ref for saving image
  const ticketRef = useRef<HTMLDivElement>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  // Auto-suggestion state
  const [suggestions, setSuggestions] = useState<Participant[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Location / Office State
  const [locations, setLocations] = useState<RefLocation[]>([]);
  const [affiliationType, setAffiliationType] = useState<'Office' | 'LGU'>('Office');
  const [selectedProvince, setSelectedProvince] = useState<string>('');
  const [selectedCity, setSelectedCity] = useState<string>('');

  // Consent State
  const [consent, setConsent] = useState(false);

  const [formData, setFormData] = useState({
    full_name: '',
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
    location_id: null as number | null
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

  const handleNameChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setFormData(prev => ({ ...prev, full_name: value }));

    if (value.length >= 2) {
        const { data } = await supabase
            .from('participants')
            .select('*')
            .ilike('full_name', `%${value}%`)
            .limit(5);
        
        if (data && data.length > 0) {
            setSuggestions(data);
            setShowSuggestions(true);
        } else {
            setSuggestions([]);
            setShowSuggestions(false);
        }
    } else {
        setSuggestions([]);
        setShowSuggestions(false);
    }
  };

  const selectSuggestion = (p: Participant) => {
      // Determine affiliation type based on location_id
      let affType: 'Office' | 'LGU' = 'Office';
      let prov = '';
      let city = '';
      let locId = p.location_id || null;

      if (locId && locations.length > 0) {
          const loc = locations.find(l => l.location_id === locId);
          if (loc) {
              affType = 'LGU';
              prov = loc.province_huc;
              city = loc.city_mun || '';
          }
      }

      setAffiliationType(affType);
      setSelectedProvince(prov);
      setSelectedCity(city);

      setFormData({
          ...formData,
          full_name: p.full_name,
          email: p.email || '',
          gender: p.gender || 'Male',
          position: p.position || '',
          office: p.office || '',
          mobile_no: p.mobile_no || '',
          age_group: p.age_group || '18-24',
          pwd: p.pwd || 'No',
          indigenous_people: p.indigenous_people || 'No',
          location_id: locId
      });
      setSuggestions([]);
      setShowSuggestions(false);
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

    if (affiliationType === 'LGU') {
        if (!selectedProvince) {
            setError("Please select a Province/HUC for LGU.");
            return;
        }
        
        if (selectedCity) {
            // City Selected
            const loc = locations.find(l => l.province_huc === selectedProvince && l.city_mun === selectedCity);
            if (loc) {
                finalLocationId = loc.location_id;
                finalOfficeName = `LGU ${selectedCity}, ${selectedProvince}`;
            } else {
                setError("Selected location is invalid.");
                return;
            }
        } else {
            // Province/HUC Level Selected (No City)
            // Try to find location ID for the province itself (where city_mun is null)
            const loc = locations.find(l => l.province_huc === selectedProvince && !l.city_mun);
            if (loc) {
                finalLocationId = loc.location_id;
            }
            
            // Construct Name
            if (selectedProvince.toLowerCase().includes('city')) {
                 // Likely an HUC (e.g. Cagayan de Oro City)
                 finalOfficeName = `LGU ${selectedProvince}`;
            } else {
                 // Likely a Province
                 finalOfficeName = `Provincial Gov't of ${selectedProvince}`;
            }
        }
    } else {
        if (!formData.office.trim()) {
            setError("Please enter your Office / Agency name.");
            return;
        }
    }

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

        // Try finding by email first
        const { data: existingUser } = await supabase
            .from('participants')
            .select('participant_id, participant_code')
            .eq('email', formData.email)
            .single();

        if (existingUser) {
            participantId = existingUser.participant_id;
            finalParticipantCode = existingUser.participant_code;
            
            // Update existing participant details
            await supabase.from('participants').update({
                full_name: formData.full_name,
                gender: formData.gender,
                position: formData.position,
                office: finalOfficeName,
                location_id: finalLocationId,
                mobile_no: formData.mobile_no,
                age_group: formData.age_group,
                pwd: formData.pwd,
                indigenous_people: formData.indigenous_people
            }).eq('participant_id', participantId);
        } else {
            // Create new participant
            const initials = formData.full_name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 3);
            const code = `${initials}-${Date.now().toString().slice(-6)}`;

            const { data: newUser, error: createError } = await supabase
                .from('participants')
                .insert([{
                    full_name: formData.full_name,
                    email: formData.email,
                    gender: formData.gender,
                    position: formData.position,
                    office: finalOfficeName,
                    location_id: finalLocationId,
                    participant_code: code,
                    mobile_no: formData.mobile_no,
                    age_group: formData.age_group,
                    pwd: formData.pwd,
                    indigenous_people: formData.indigenous_people
                }])
                .select()
                .single();
            
            if (createError) throw createError;
            participantId = newUser.participant_id;
            finalParticipantCode = newUser.participant_code;
        }

        // 2. Register for Event
        const { error: regError } = await supabase
            .from('event_participants')
            .insert({
                event_id: id,
                participant_id: participantId,
                registration_status: 'Registered',
                role: 'Delegate', // Forced Delegate role for public registration
                needs_accommodation: formData.needs_accommodation,
                accommodation_pax: formData.needs_accommodation ? formData.accommodation_pax : 0
            });

        if (regError) {
            if (regError.code === '23505') {
                // Unique violation: Already Registered
                setAlreadyRegistered(true);
            } else {
                throw regError;
            }
        }

        // 3. Set QR Token (Use Participant Code) and Show Success
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
        const canvas = await html2canvas(ticketRef.current, {
            backgroundColor: '#ffffff',
            scale: 2 // Higher resolution
        });
        const dataUrl = canvas.toDataURL('image/png');
        
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = `${event?.event_name.substring(0, 20).replace(/\s+/g, '_')}_${formData.full_name.replace(/\s+/g, '_')}_Pass.png`;
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
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 flex justify-center">
        <div className="max-w-xl w-full bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-100">
            {/* Event Header */}
            <div className="bg-indigo-600 p-6 sm:p-8 text-white relative overflow-hidden">
                <div className="relative z-10">
                    <span className="inline-block px-2 py-1 bg-white/20 rounded text-xs font-semibold mb-3">Registration Open</span>
                    <h1 className="text-2xl sm:text-3xl font-bold mb-2">{event.event_name}</h1>
                    <div className="flex flex-col gap-2 mt-4 text-indigo-100 text-sm font-medium">
                        <div className="flex items-center gap-2">
                            <Calendar size={16} />
                            <span>{format(new Date(event.start_date), 'MMMM d, yyyy')}</span>
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
                
                <form onSubmit={handleSubmit} className="space-y-5">
                    
                    {/* SECTION: Personal Info */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider border-b pb-2 mb-4">Personal Information</h3>
                        
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1.5">Full Name</label>
                            <div className="relative">
                                <User className="absolute left-3 top-3 text-slate-400" size={18} />
                                <input 
                                    required 
                                    type="text"
                                    className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                                    placeholder="Type your name..."
                                    value={formData.full_name}
                                    onChange={handleNameChange}
                                    onFocus={() => { if(formData.full_name.length >= 2 && suggestions.length > 0) setShowSuggestions(true); }}
                                    onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                                    autoComplete="off"
                                />
                                {showSuggestions && suggestions.length > 0 && (
                                    <ul className="absolute z-50 w-full bg-white border border-slate-200 rounded-lg shadow-xl mt-1 max-h-60 overflow-y-auto animate-in fade-in zoom-in-95 duration-100">
                                        {suggestions.map((p) => (
                                            <li 
                                                key={p.participant_id}
                                                onClick={() => selectSuggestion(p)}
                                                className="px-4 py-3 hover:bg-indigo-50 cursor-pointer border-b border-slate-50 last:border-0 transition-colors group"
                                            >
                                                <div className="flex justify-between items-center">
                                                    <div className="font-medium text-slate-800 group-hover:text-indigo-700">{p.full_name}</div>
                                                    <span className="text-xs bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded">Select</span>
                                                </div>
                                                <div className="text-xs text-slate-500 mt-0.5">{p.email} • {p.office}</div>
                                            </li>
                                        ))}
                                    </ul>
                                )}
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

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">Gender</label>
                                <select 
                                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-white"
                                    value={formData.gender}
                                    onChange={e => setFormData({...formData, gender: e.target.value})}
                                >
                                    <option value="Male">Male</option>
                                    <option value="Female">Female</option>
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
                                            onChange={() => setFormData(prev => ({ ...prev, needs_accommodation: true, accommodation_pax: Math.max(1, prev.accommodation_pax) }))}
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

                             {formData.needs_accommodation && (
                                 <div className="animate-in fade-in slide-in-from-top-2">
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Number of Pax</label>
                                    <input 
                                        type="number"
                                        min="1"
                                        required={formData.needs_accommodation}
                                        className="w-full px-4 py-2 border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                                        value={formData.accommodation_pax}
                                        onChange={e => setFormData({...formData, accommodation_pax: parseInt(e.target.value) || 0})}
                                    />
                                    <p className="text-xs text-indigo-500 mt-1">Specify number of people needing stay (including yourself).</p>
                                 </div>
                             )}
                        </div>
                    )}

                    {/* Data Privacy Consent */}
                    <div className="flex items-start gap-3 bg-slate-50 p-3 rounded-lg border border-slate-100 mt-4">
                        <div className="flex items-center h-5">
                            <input
                                id="privacy-consent"
                                type="checkbox"
                                required
                                checked={consent}
                                onChange={(e) => setConsent(e.target.checked)}
                                className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 cursor-pointer"
                            />
                        </div>
                        <label htmlFor="privacy-consent" className="text-xs text-slate-600 leading-relaxed cursor-pointer text-justify">
In compliance to the Data Privacy Act of 2012 (Republic Act No. 10173), we are reminded of the importance of adhering to the policies and guidelines outlined within it to safeguard sensitive and personal information.
As part of our ongoing commitment to protect personal data and ensure compliance with legal obligations, all personal data shared therein will be treated with the utmost care and confidentiality. Access to such data is only limited to the management who require it for legitimate work purposes only.                        </label>
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
