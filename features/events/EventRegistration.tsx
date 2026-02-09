import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Event, Participant } from '../../types/database';
import QRCode from 'react-qr-code';
import { CheckCircle, Calendar, MapPin, User, Mail, Briefcase, Building, Loader2, Search } from 'lucide-react';
import { format } from 'date-fns';

const EventRegistration: React.FC = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Auto-suggestion state
  const [suggestions, setSuggestions] = useState<Participant[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    gender: 'Male',
    position: '',
    office: ''
  });

  useEffect(() => {
    fetchEventDetails();
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
      setFormData({
          full_name: p.full_name,
          email: p.email,
          gender: p.gender || 'Male',
          position: p.position,
          office: p.office
      });
      setSuggestions([]);
      setShowSuggestions(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    
    try {
        if (!event) throw new Error("Event not loaded");
        
        const id = parseInt(eventId!);

        // 1. Check if participant exists by email
        let participantId: number;
        const { data: existingUser } = await supabase
            .from('participants')
            .select('participant_id')
            .eq('email', formData.email)
            .single();

        if (existingUser) {
            participantId = existingUser.participant_id;
            // Update existing participant details to match current form data
            await supabase.from('participants').update({
                full_name: formData.full_name,
                gender: formData.gender,
                position: formData.position,
                office: formData.office
            }).eq('participant_id', participantId);
        } else {
            // Create new participant
            // Generate a unique code: Initials + Timestamp + Random
            const initials = formData.full_name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 3);
            const code = `${initials}-${Date.now().toString().slice(-6)}`;

            const { data: newUser, error: createError } = await supabase
                .from('participants')
                .insert([{
                    ...formData,
                    participant_code: code
                }])
                .select()
                .single();
            
            if (createError) throw createError;
            participantId = newUser.participant_id;
        }

        // 2. Register for Event
        const { error: regError } = await supabase
            .from('event_participants')
            .insert({
                event_id: id,
                participant_id: participantId,
                registration_status: 'Registered'
            });

        // Ignore unique violation (already registered)
        if (regError && regError.code !== '23505') {
            throw regError;
        }

        // 3. Ensure QR Token Exists
        let token = '';
        const { data: qrData } = await supabase
            .from('participant_qr')
            .select('qr_token')
            .eq('participant_id', participantId)
            .single();

        if (qrData) {
            token = qrData.qr_token;
        } else {
            token = `evt-${Date.now()}-${Math.random().toString(36).substring(7)}`;
            await supabase.from('participant_qr').insert({
                participant_id: participantId,
                qr_token: token
            });
        }

        setQrToken(token);
        setSuccess(true);

    } catch (err: any) {
        setError(err.message || "Registration failed. Please try again.");
    } finally {
        setSubmitting(false);
    }
  };

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

  if (success && qrToken) {
      return (
          <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 flex justify-center">
              <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden">
                  <div className="bg-green-600 px-6 py-8 text-center text-white">
                      <div className="flex justify-center mb-4">
                          <div className="bg-white/20 p-3 rounded-full">
                              <CheckCircle size={48} className="text-white" />
                          </div>
                      </div>
                      <h2 className="text-3xl font-bold mb-2">Registration Confirmed!</h2>
                      <p className="text-green-100">See you at {event.event_name}</p>
                  </div>
                  
                  <div className="p-8 flex flex-col items-center text-center">
                      <p className="text-slate-600 mb-6">
                          Please save this QR code. Present it at the venue entrance for attendance scanning.
                      </p>
                      
                      <div className="border-4 border-slate-900 p-4 rounded-xl mb-6 bg-white shadow-sm">
                          <QRCode value={qrToken} size={200} />
                      </div>

                      <div className="w-full bg-slate-50 rounded-lg p-4 text-left border border-slate-100">
                          <p className="text-xs text-slate-400 uppercase font-bold tracking-wider mb-2">Participant Details</p>
                          <p className="font-bold text-slate-800 text-lg">{formData.full_name}</p>
                          <p className="text-slate-500">{formData.email}</p>
                          <p className="text-slate-500 text-sm mt-1">{formData.position} • {formData.office}</p>
                      </div>
                      
                      <button 
                        onClick={() => window.print()} 
                        className="mt-8 w-full bg-slate-900 text-white py-3 rounded-lg font-semibold hover:bg-slate-800 transition-colors"
                      >
                          Print / Save Details
                      </button>
                  </div>
              </div>
          </div>
      );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 flex justify-center">
        <div className="max-w-lg w-full bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-100">
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

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">Email Address</label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-3 text-slate-400" size={18} />
                            <input 
                                required 
                                type="email"
                                className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                                placeholder="john@company.com"
                                value={formData.email}
                                onChange={e => setFormData({...formData, email: e.target.value})}
                            />
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
                                <option value="Other">Other</option>
                            </select>
                        </div>
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
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">Office / Department</label>
                        <div className="relative">
                            <Building className="absolute left-3 top-3 text-slate-400" size={18} />
                            <input 
                                required 
                                type="text"
                                className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                                placeholder="IT Department"
                                value={formData.office}
                                onChange={e => setFormData({...formData, office: e.target.value})}
                            />
                        </div>
                    </div>

                    <div className="pt-4">
                        <button 
                            type="submit" 
                            disabled={submitting}
                            className="w-full bg-indigo-600 text-white font-bold py-3 rounded-lg hover:bg-indigo-700 transition-all shadow-md hover:shadow-lg disabled:opacity-70 flex justify-center items-center gap-2"
                        >
                            {submitting && <Loader2 className="animate-spin" size={20} />}
                            {submitting ? 'Registering...' : 'Complete Registration'}
                        </button>
                    </div>
                    <p className="text-center text-xs text-slate-400 mt-4">
                        By registering, you agree to the event terms and conditions.
                    </p>
                </form>
            </div>
        </div>
    </div>
  );
};

export default EventRegistration;
