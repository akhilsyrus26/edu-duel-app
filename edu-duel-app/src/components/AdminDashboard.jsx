import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

const DEPARTMENTS = ["EEE","CSE","ME","CE","ECE","BBA","ETE","Physics","Chemistry","Math"];

export default function AdminDashboard({ onBack }) {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    q: '',
    option_a: '',
    option_b: '',
    option_c: '',
    option_d: '',
    answer: 0,
    subject: 'CSE'
  });
  const [isEditing, setIsEditing] = useState(null);

  useEffect(() => {
    fetchQuestions();
  }, []);

  const fetchQuestions = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('questions')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (!error) setQuestions(data);
    setLoading(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isEditing) {
      const { error } = await supabase
        .from('questions')
        .update(formData)
        .eq('id', isEditing);
      if (!error) {
        setIsEditing(null);
        setFormData({ q: '', option_a: '', option_b: '', option_c: '', option_d: '', answer: 0, subject: 'CSE' });
        fetchQuestions();
      }
    } else {
      const { error } = await supabase
        .from('questions')
        .insert([formData]);
      if (!error) {
        setFormData({ q: '', option_a: '', option_b: '', option_c: '', option_d: '', answer: 0, subject: 'CSE' });
        fetchQuestions();
      }
    }
  };

  const deleteQuestion = async (id) => {
    if (window.confirm("Are you sure you want to delete this question?")) {
      await supabase.from('questions').delete().eq('id', id);
      fetchQuestions();
    }
  };

  const editQuestion = (q) => {
    setIsEditing(q.id);
    setFormData({
      q: q.q,
      option_a: q.option_a,
      option_b: q.option_b,
      option_c: q.option_c,
      option_d: q.option_d,
      answer: q.answer,
      subject: q.subject
    });
  };

  return (
    <div className="panel" style={{ width: '100%', maxWidth: '800px', margin: '20px auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div className="section-title">Question Management</div>
        <button className="btn btn-ghost" style={{ width: 'auto', padding: '8px 16px' }} onClick={onBack}>Back to Lobby</button>
      </div>

      <form onSubmit={handleSubmit} style={{ background: 'var(--panel2)', padding: '20px', borderRadius: '8px', marginBottom: '30px', border: '1px solid var(--border)' }}>
        <div className="field">
          <label>Question Text</label>
          <input required value={formData.q} onChange={e => setFormData({...formData, q: e.target.value})} placeholder="e.g. What is the derivative of x^2?" />
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
          <div className="field">
            <label>Option A</label>
            <input required value={formData.option_a} onChange={e => setFormData({...formData, option_a: e.target.value})} />
          </div>
          <div className="field">
            <label>Option B</label>
            <input required value={formData.option_b} onChange={e => setFormData({...formData, option_b: e.target.value})} />
          </div>
          <div className="field">
            <label>Option C</label>
            <input required value={formData.option_c} onChange={e => setFormData({...formData, option_c: e.target.value})} />
          </div>
          <div className="field">
            <label>Option D</label>
            <input required value={formData.option_d} onChange={e => setFormData({...formData, option_d: e.target.value})} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
          <div className="field">
            <label>Correct Answer</label>
            <select value={formData.answer} onChange={e => setFormData({...formData, answer: parseInt(e.target.value)})}>
              <option value={0}>Option A</option>
              <option value={1}>Option B</option>
              <option value={2}>Option C</option>
              <option value={3}>Option D</option>
            </select>
          </div>
          <div className="field">
            <label>Department</label>
            <select value={formData.subject} onChange={e => setFormData({...formData, subject: e.target.value})}>
              {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        </div>

        <button type="submit" className="btn btn-primary" style={{ marginTop: '10px' }}>
          {isEditing ? 'Update Question' : 'Add Question'}
        </button>
        {isEditing && <button type="button" className="btn btn-ghost" style={{ marginTop: '10px' }} onClick={() => { setIsEditing(null); setFormData({ q: '', option_a: '', option_b: '', option_c: '', option_d: '', answer: 0, subject: 'CSE' }); }}>Cancel</button>}
      </form>

      <div className="section-title">Existing Questions ({questions.length})</div>
      <div style={{ maxHeight: '400px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '20px', color: 'var(--muted)' }}>Loading...</div>
        ) : questions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px', color: 'var(--muted)' }}>No questions found. Add your first one!</div>
        ) : questions.map(q => (
          <div key={q.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', padding: '15px', borderRadius: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
              <span className="q-tag">{q.subject}</span>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => editQuestion(q)} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '0.8rem' }}>Edit</button>
                <button onClick={() => deleteQuestion(q.id)} style={{ background: 'none', border: 'none', color: 'var(--accent2)', cursor: 'pointer', fontSize: '0.8rem' }}>Delete</button>
              </div>
            </div>
            <div style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '10px' }}>{q.q}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '0.85rem' }}>
              <div style={{ color: q.answer === 0 ? 'var(--accent3)' : 'inherit' }}>A: {q.option_a}</div>
              <div style={{ color: q.answer === 1 ? 'var(--accent3)' : 'inherit' }}>B: {q.option_b}</div>
              <div style={{ color: q.answer === 2 ? 'var(--accent3)' : 'inherit' }}>C: {q.option_c}</div>
              <div style={{ color: q.answer === 3 ? 'var(--accent3)' : 'inherit' }}>D: {q.option_d}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
