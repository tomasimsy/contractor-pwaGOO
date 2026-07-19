"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils/formatting";
import { filterActive } from '@/lib/queries/softDeleteFilter';
import { X, Trash2, Edit2, Check, DollarSign } from "lucide-react";

type Agent = {
  id: string;
  name: string;
  email: string;
  phone: string;
};

type AssignedAgent = {
  id: string;
  amount: number;
  notes: string;
  agent_id: string;
  agents?: Agent;
};

interface AgentModalProps {
  isOpen: boolean;
  onClose: () => void;
  estimateId: string;
  estimateTotal: number;
  subcontractorCost: number;
  companyPercentage?: number;
  onRefresh: () => void;
}

export default function AgentModal({ 
  isOpen, 
  onClose, 
  estimateId, 
  estimateTotal,
  subcontractorCost,
  companyPercentage = 30,
  onRefresh 
}: AgentModalProps) {
  // ADD THIS LINE RIGHT HERE
  console.log("AgentModal received subcontractorCost:", subcontractorCost);
  console.log("AgentModal received estimateTotal:", estimateTotal);

  const [agents, setAgents] = useState<Agent[]>([]);
  const [assignedAgents, setAssignedAgents] = useState<AssignedAgent[]>([]);
  const [showNewAgentForm, setShowNewAgentForm] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [agentNotes, setAgentNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [editingAgent, setEditingAgent] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState(0);
  // In AgentModal, the calculation should be:
const afterSubcontractor = estimateTotal - subcontractorCost;
const companyAmount = (afterSubcontractor * companyPercentage) / 100;
const remainingForAgents = afterSubcontractor - companyAmount;

  
  const [newAgent, setNewAgent] = useState({ name: "", email: "", phone: "" });

   

  useEffect(() => {
    if (isOpen) loadData();
  }, [isOpen]);

  async function loadData() {
    setLoading(true);
    try {
      const [{ data: agentsData }, { data: assignedData }] = await Promise.all([
        supabase.from("agents").select("*").order("name"),
        supabase.from("estimate_agents").select("*, agents(*)").eq("estimate_id", estimateId),
      ]);
      setAgents(agentsData || []);
      setAssignedAgents(assignedData || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function redistributeEvenly(list?: AssignedAgent[]) {
    const current = list || assignedAgents;
    const count = current.length;
    if (count === 0 || remainingForAgents <= 0) return;
    const equalShare = remainingForAgents / count;
    for (const a of current) {
      await supabase.from("estimate_agents").update({ amount: equalShare }).eq("id", a.id);
    }
    await loadData();
    onRefresh();
  }

  async function createAgent() {
    if (!newAgent.name.trim()) { alert("Name is required"); return; }
    const { data } = await supabase.from("agents").insert({ name: newAgent.name, email: newAgent.email || null, phone: newAgent.phone || null }).select().single();
    if (data) {
      setAgents([data, ...agents]);
      setSelectedAgentId(data.id);
      setShowNewAgentForm(false);
      setNewAgent({ name: "", email: "", phone: "" });
    }
  }

  async function assignAgent() {
    if (!selectedAgentId) return;
    if (assignedAgents.some(a => a.agent_id === selectedAgentId)) return;
    await supabase.from("estimate_agents").insert({ estimate_id: estimateId, agent_id: selectedAgentId, amount: 0, notes: agentNotes || null });
    setSelectedAgentId("");
    setAgentNotes("");
    await loadData();
    await redistributeEvenly();
    onRefresh();
  }

  async function removeAssignment(assignmentId: string) {
    await supabase.from("estimate_agents").delete().eq("id", assignmentId);
    await loadData();
    await redistributeEvenly();
    onRefresh();
  }

  async function updateAgentAmount(agentId: string, newAmount: number) {
    if (newAmount < 0) { alert("Amount cannot be negative"); return; }
    const otherAgentsTotal = assignedAgents.filter(a => a.id !== agentId).reduce((sum, a) => sum + (a.amount || 0), 0);
    if (newAmount + otherAgentsTotal > remainingForAgents) {
      alert(`Maximum available is ${formatCurrency(remainingForAgents - otherAgentsTotal)}`);
      return;
    }
    await supabase.from("estimate_agents").update({ amount: newAmount }).eq("id", agentId);
    setEditingAgent(null);
    const remaining = remainingForAgents - (newAmount + otherAgentsTotal);
    if (remaining > 0 && assignedAgents.length > 1) {
      const lastAgent = assignedAgents.find(a => a.id !== agentId);
      if (lastAgent) {
        await supabase.from("estimate_agents").update({ amount: (lastAgent.amount || 0) + remaining }).eq("id", lastAgent.id);
      }
    }
    await loadData();
    onRefresh();
  }

  const totalAssignedAmount = assignedAgents.reduce((sum, a) => sum + (a.amount || 0), 0);
  const remainingToDistribute = remainingForAgents - totalAssignedAmount;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-5 py-4 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-gray-800">Agents Commission</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="p-5 space-y-5">
          
          <div className="bg-gradient-to-r from-green-50 to-blue-50 rounded-xl p-4 space-y-2">
            <div className="flex justify-between text-sm"><span className="text-gray-600">Estimate Total:</span><span className="font-semibold">{formatCurrency(estimateTotal)}</span></div>
            <div className="bg-amber-50 -mx-2 px-3 py-2 rounded-lg border border-amber-200">
              <div className="flex justify-between items-center"><div className="flex items-center gap-2"><DollarSign size={14} className="text-amber-600" /><span className="text-sm font-medium text-amber-800">Subcontractor Paid:</span></div><span className="text-sm font-bold text-red-600">-{formatCurrency(subcontractorCost)}</span></div>
              <div className="text-[10px] text-amber-600 mt-1">Total payments made to subcontractors</div>
            </div>
            <div className="border-t my-2"></div>
            <div className="flex justify-between text-sm"><span className="text-gray-600">After Subcontractor:</span><span className="font-semibold">{formatCurrency(afterSubcontractor)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-gray-600">Company (30%):</span><span className="font-semibold text-blue-600">-{formatCurrency(companyAmount)}</span></div>
            <div className="border-t my-2"></div>
            <div className="flex justify-between text-base font-bold"><span>Total for Agents:</span><span className="text-green-700">{formatCurrency(remainingForAgents)}</span></div>
            {assignedAgents.length > 0 && <div className="flex justify-between text-xs text-gray-500 mt-1"><span>Distributed:</span><span>{formatCurrency(totalAssignedAmount)} / {formatCurrency(remainingForAgents)}</span></div>}
          </div>

          <div>
            <div className="flex justify-between items-center mb-2"><label className="text-sm font-medium text-gray-700">Add Agent</label><button onClick={() => setShowNewAgentForm(!showNewAgentForm)} className="text-xs text-blue-600">+ New Agent</button></div>
            {showNewAgentForm && (
              <div className="mb-3 p-3 bg-gray-50 rounded-lg space-y-2">
                <input type="text" placeholder="Name *" value={newAgent.name} onChange={(e) => setNewAgent({ ...newAgent, name: e.target.value })} className="w-full border rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/30" />
                <input type="email" placeholder="Email" value={newAgent.email} onChange={(e) => setNewAgent({ ...newAgent, email: e.target.value })} className="w-full border rounded-lg p-2 text-sm" />
                <input type="tel" placeholder="Phone" value={newAgent.phone} onChange={(e) => setNewAgent({ ...newAgent, phone: e.target.value })} className="w-full border rounded-lg p-2 text-sm" />
                <div className="flex gap-2 pt-1"><button onClick={() => setShowNewAgentForm(false)} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-100">Cancel</button><button onClick={createAgent} className="flex-1 py-2 bg-green-700 text-white rounded-lg text-sm hover:bg-green-800">Create Agent</button></div>
              </div>
            )}
            <div className="flex gap-2"><select value={selectedAgentId} onChange={(e) => setSelectedAgentId(e.target.value)} className="flex-1 border rounded-lg p-2 text-sm"><option value="">Select agent...</option>{agents.filter(a => !assignedAgents.some(assigned => assigned.agent_id === a.id)).map((agent) => (<option key={agent.id} value={agent.id}>{agent.name}</option>))}</select><button onClick={assignAgent} className="px-4 py-2 bg-green-700 text-white rounded-lg text-sm">Add</button></div>
            <textarea placeholder="Notes (optional)" value={agentNotes} onChange={(e) => setAgentNotes(e.target.value)} className="w-full mt-2 border rounded-lg p-2 text-sm" rows={1} />
          </div>

          {loading ? <div className="text-center py-8 text-gray-400">Loading...</div> : assignedAgents.length === 0 ? <div className="text-center py-8 text-gray-400">No agents assigned</div> : (
            <div className="space-y-3">
              {assignedAgents.map((agent) => (
                <div key={agent.id} className="border rounded-lg p-3">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="font-semibold text-gray-800">{agent.agents?.name}</div>
                      {editingAgent === agent.id ? (
                        <div className="flex items-center gap-2 mt-1"><span className="text-sm text-gray-500">$</span><input type="number" value={editAmount} onChange={(e) => setEditAmount(Number(e.target.value))} className="w-28 border rounded-lg p-1 text-sm" step="0.01" autoFocus /><button onClick={() => updateAgentAmount(agent.id, editAmount)} className="text-green-600"><Check size={16} /></button><button onClick={() => setEditingAgent(null)} className="text-gray-400"><X size={16} /></button></div>
                      ) : (
                        <div className="flex items-center gap-2 mt-1"><span className="text-sm font-semibold text-green-700">{formatCurrency(agent.amount || 0)}</span><button onClick={() => { setEditingAgent(agent.id); setEditAmount(agent.amount || 0); }} className="text-gray-400 hover:text-blue-500"><Edit2 size={12} /></button></div>
                      )}
                      {agent.notes && <div className="text-xs text-gray-400 mt-1">{agent.notes}</div>}
                    </div>
                    <button onClick={() => removeAssignment(agent.id)} className="text-red-500 text-sm px-2">✕</button>
                  </div>
                </div>
              ))}
              {assignedAgents.length > 1 && (<button onClick={async () => { await redistributeEvenly(); }} className="w-full py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 active:scale-[0.99] transition shadow-sm">Redistribute Evenly ({assignedAgents.length} agents = {formatCurrency(remainingForAgents / assignedAgents.length)} each)</button>)}
            </div>
          )}
          
          {assignedAgents.length > 0 && totalAssignedAmount > 0 && (
            <div className="border-t pt-3">
              <div className="flex justify-between text-sm font-semibold"><span>Total Commission:</span><span className="text-green-700">{formatCurrency(totalAssignedAmount)}</span></div>
              {remainingToDistribute !== 0 && <div className="flex justify-between text-xs text-orange-600 mt-1"><span>Remaining to Distribute:</span><span>{formatCurrency(remainingToDistribute)}</span></div>}
              {assignedAgents.length > 0 && <div className="text-xs text-gray-500 mt-2 text-center italic">Each agent would receive {formatCurrency(remainingForAgents / assignedAgents.length)} if distributed evenly</div>}
            </div>
          )}
        </div>
        <div className="bg-amber-50 -mx-2 px-3 py-2 rounded-lg border border-amber-200">
  <div className="flex justify-between items-center">
    <div className="flex items-center gap-2">
      <DollarSign size={14} className="text-amber-600" />
      <span className="text-sm font-medium text-amber-800">Subcontractor Paid:</span>
    </div>
    <span className="text-sm font-bold text-red-600">-{formatCurrency(subcontractorCost)}</span>
  </div>
  <div className="text-[10px] text-amber-600 mt-1">
    Total payments made to subcontractors
  </div>
</div>
      </div>
    </div>
  );
}