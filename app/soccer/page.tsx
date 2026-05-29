"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

// ======================
// TYPES
// ======================
type Team = {
  id: string;
  team: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
  form: string[];
};

type Game = {
  id?: string;
  week: number;
  home: string;
  away: string;
  home_score?: number | null;
  away_score?: number | null;
  played?: boolean;
};

type WeekSchedule = {
  week: number;
  games: Game[];
};

export default function SoccerTournamentPage() {
  const [standings, setStandings] = useState<Team[]>([]);
  const [schedule, setSchedule] = useState<WeekSchedule[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editingGame, setEditingGame] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{ [key: string]: { home: number; away: number } }>({});

  // All 4 teams
  const allTeams = ["Binh FC", "Land of Fire UMC", "Highland Warriors FC", "Hustlang FC"];

  // Schedule - Each team plays 1 game per week, 6 weeks total
  const initialSchedule: WeekSchedule[] = [
    {
      week: 1,
      games: [
        { week: 1, home: "Binh FC", away: "Land of Fire UMC" },
        { week: 1, home: "Highland Warriors FC", away: "Hustlang FC" },
      ],
    },
    {
      week: 2,
      games: [
        { week: 2, home: "Binh FC", away: "Hustlang FC" },
        { week: 2, home: "Highland Warriors FC", away: "Land of Fire UMC" },
      ],
    },
    {
      week: 3,
      games: [
        { week: 3, home: "Binh FC", away: "Highland Warriors FC" },
        { week: 3, home: "Land of Fire UMC", away: "Hustlang FC" },
      ],
    },
    {
      week: 4,
      games: [
        { week: 4, home: "Land of Fire UMC", away: "Binh FC" },
        { week: 4, home: "Hustlang FC", away: "Highland Warriors FC" },
      ],
    },
    {
      week: 5,
      games: [
        { week: 5, home: "Hustlang FC", away: "Binh FC" },
        { week: 5, home: "Land of Fire UMC", away: "Highland Warriors FC" },
      ],
    },
    {
      week: 6,
      games: [
        { week: 6, home: "Highland Warriors FC", away: "Binh FC" },
        { week: 6, home: "Hustlang FC", away: "Land of Fire UMC" },
      ],
    },
  ];

  // ======================
  // LOAD DATA
  // ======================
  useEffect(() => {
    initializeDatabase();
  }, []);

  async function initializeDatabase() {
    setLoading(true);
    
    try {
      const { data: existingTeams } = await supabase.from("teams").select("*");

      if (!existingTeams || existingTeams.length === 0) {
        for (const teamName of allTeams) {
          await supabase.from("teams").insert([{ 
            team: teamName,
            played: 0, wins: 0, draws: 0, losses: 0,
            gf: 0, ga: 0, gd: 0, points: 0
          }]);
        }
      }

      const { data: existingMatches } = await supabase.from("matches").select("*");

      if (!existingMatches || existingMatches.length === 0) {
        for (const week of initialSchedule) {
          for (const game of week.games) {
            await supabase.from("matches").insert([{
              week: game.week,
              home: game.home,
              away: game.away,
              home_score: null,
              away_score: null,
              played: false,
            }]);
          }
        }
      }

      await loadMatches();
      await calculateStandings();
      
    } catch (err) {
      console.error("Error:", err);
    } finally {
      setLoading(false);
    }
  }

  async function loadMatches() {
    const { data } = await supabase
      .from("matches")
      .select("*")
      .order("week", { ascending: true });

    if (!data) return;

    const grouped: { [key: number]: Game[] } = {};
    data.forEach((match) => {
      if (!grouped[match.week]) grouped[match.week] = [];
      grouped[match.week].push({
        id: match.id,
        week: match.week,
        home: match.home,
        away: match.away,
        home_score: match.home_score,
        away_score: match.away_score,
        played: match.played,
      });
    });

    const scheduleArray = Object.keys(grouped).map((week) => ({
      week: parseInt(week),
      games: grouped[parseInt(week)],
    }));

    setSchedule(scheduleArray);
  }

  async function calculateStandings() {
    const { data: matches } = await supabase.from("matches").select("*");
    const playedMatches = matches?.filter(m => m.played === true) || [];

    const stats: { [key: string]: any } = {};
    allTeams.forEach((teamName) => {
      stats[teamName] = {
        team: teamName,
        played: 0, wins: 0, draws: 0, losses: 0,
        gf: 0, ga: 0, gd: 0, points: 0, form: [],
      };
    });

    playedMatches.forEach((match) => {
      const home = stats[match.home];
      const away = stats[match.away];
      if (!home || !away) return;

      home.played++;
      away.played++;
      home.gf += match.home_score;
      home.ga += match.away_score;
      away.gf += match.away_score;
      away.ga += match.home_score;

      if (match.home_score > match.away_score) {
        home.wins++; away.losses++; home.points += 3;
        home.form.unshift('W'); away.form.unshift('L');
      } else if (match.home_score < match.away_score) {
        away.wins++; home.losses++; away.points += 3;
        home.form.unshift('L'); away.form.unshift('W');
      } else {
        home.draws++; away.draws++;
        home.points += 1; away.points += 1;
        home.form.unshift('D'); away.form.unshift('D');
      }
      
      if (home.form.length > 5) home.form.pop();
      if (away.form.length > 5) away.form.pop();
    });

    for (const team of Object.values(stats)) {
      team.gd = team.gf - team.ga;
    }

    const standingsArray = Object.values(stats).map(team => ({
      id: team.team,
      team: team.team,
      played: team.played,
      wins: team.wins,
      draws: team.draws,
      losses: team.losses,
      gf: team.gf,
      ga: team.ga,
      gd: team.gd,
      points: team.points,
      form: team.form,
    }));

    const sorted = standingsArray.sort((a, b) => {
      if (a.points !== b.points) return b.points - a.points;
      if (a.gd !== b.gd) return b.gd - a.gd;
      return b.gf - a.gf;
    });

    setStandings(sorted);
  }

  async function saveScore(matchId: string, homeScore: number, awayScore: number) {
    if (isNaN(homeScore) || isNaN(awayScore)) {
      alert("Please enter valid scores");
      return;
    }

    setSaving(true);

    try {
      await supabase
        .from("matches")
        .update({
          home_score: homeScore,
          away_score: awayScore,
          played: true,
        })
        .eq("id", matchId);

      await calculateStandings();
      await loadMatches();
      setEditingGame(null);
      setEditValues({});
      alert("Score saved!");
      
    } catch (err) {
      console.error("Error:", err);
      alert("Error saving score");
    } finally {
      setSaving(false);
    }
  }

  async function updateScore(matchId: string, homeScore: number, awayScore: number) {
    if (isNaN(homeScore) || isNaN(awayScore)) {
      alert("Please enter valid scores");
      return;
    }

    setSaving(true);

    try {
      await supabase
        .from("matches")
        .update({
          home_score: homeScore,
          away_score: awayScore,
          played: true,
        })
        .eq("id", matchId);

      await calculateStandings();
      await loadMatches();
      setEditingGame(null);
      setEditValues({});
      alert("Score updated!");
      
    } catch (err) {
      console.error("Error:", err);
      alert("Error updating score");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(gameId: string, currentHome: number, currentAway: number) {
    setEditingGame(gameId);
    setEditValues({
      [gameId]: { home: currentHome, away: currentAway }
    });
  }

  function cancelEdit() {
    setEditingGame(null);
    setEditValues({});
  }

  // Calculate tournament stats for hero
  const totalGoals = standings.reduce((sum, t) => sum + t.gf, 0);
  const totalMatches = schedule.reduce((sum, week) => sum + week.games.length, 0);
  const completedMatches = schedule.reduce((sum, week) => sum + week.games.filter(g => g.played).length, 0);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#07111f] to-[#0a1a2a] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#d4a048] mx-auto mb-4"></div>
          <p className="text-gray-400">Loading tournament data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#07111f] to-[#0a1a2a] text-white pb-20">
      
      {/* UNIQUE HERO SECTION - KING OF CHARLOTTE */}
      <section className="relative overflow-hidden">
        {/* Animated background gradient */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#d4a048]/20 via-transparent to-[#d4a048]/10" />
        
        {/* Floating particles effect */}
        <div className="absolute inset-0 opacity-30">
          <div className="absolute top-20 left-10 w-32 h-32 bg-[#d4a048]/20 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-20 right-10 w-40 h-40 bg-[#d4a048]/10 rounded-full blur-3xl animate-pulse delay-1000" />
          <div className="absolute top-1/2 left-1/2 w-60 h-60 bg-[#d4a048]/5 rounded-full blur-3xl animate-pulse delay-500" />
        </div>

        <div className="relative max-w-7xl mx-auto px-6 py-24 md:py-32">
          <div className="text-center">
            {/* Crown icon */}
            <div className="inline-block mb-6">
              <div className="relative">
                <span className="text-6xl md:text-7xl animate-bounce inline-block">👑</span>
                <div className="absolute -top-2 -right-2 w-3 h-3 bg-[#d4a048] rounded-full animate-ping" />
              </div>
            </div>
            
            {/* Main title */}
            <h2 className="text-6xl md:text-8xl font-black tracking-tight mb-4">
              <span className="bg-gradient-to-r from-[#d4a048] via-[#f5e6b8] to-[#d4a048] bg-clip-text text-transparent">
                2026
              </span>
            </h2>
            <h1 className="text-6xl md:text-8xl font-black tracking-tight mb-4">
              <span className="bg-gradient-to-r from-[#d4a048] via-[#f5e6b8] to-[#d4a048] bg-clip-text text-transparent">
                King of Charlotte Cup
              </span>
            </h1>
            <h2 className="text-6xl md:text-8xl font-black tracking-tight mb-4">
              <span className="bg-gradient-to-r from-[#d4a048] via-[#f5e6b8] to-[#d4a048] bg-clip-text text-transparent">
                $1200.00
              </span>
            </h2>
            
            {/* Subtitle with unique phrasing */}
            <p className="text-xl md:text-2xl text-gray-300 max-w-3xl mx-auto mt-6 leading-relaxed">
              {/* Where legends are forged and glory is earned.  */}
              <span className="block text-[#d4a048] font-semibold mt-2">Four clans. Six battles. One throne.</span>
            </p>
            
            {/* Tagline */}
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <div className="px-4 py-2 bg-white/5 rounded-full backdrop-blur-sm border border-[#d4a048]/30">
                <span className="text-sm uppercase tracking-wider">⚔️ Double Round Robin</span>
              </div>
              <div className="px-4 py-2 bg-white/5 rounded-full backdrop-blur-sm border border-[#d4a048]/30">
                <span className="text-sm uppercase tracking-wider">🏆 Crown the Champion</span>
              </div>
              <div className="px-4 py-2 bg-white/5 rounded-full backdrop-blur-sm border border-[#d4a048]/30">
                <span className="text-sm uppercase tracking-wider">💀 No Mercy</span>
              </div>
            </div>

            {/* Tournament stats */}
            <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-6 max-w-3xl mx-auto">
              <div className="text-center">
                <div className="text-3xl md:text-4xl font-black text-[#d4a048]">4</div>
                <div className="text-xs text-gray-400 uppercase tracking-wider mt-1">Warriors</div>
              </div>
              <div className="text-center">
                <div className="text-3xl md:text-4xl font-black text-[#d4a048]">6</div>
                <div className="text-xs text-gray-400 uppercase tracking-wider mt-1">Battle Rounds</div>
              </div>
              <div className="text-center">
                <div className="text-3xl md:text-4xl font-black text-[#d4a048]">{totalMatches}</div>
                <div className="text-xs text-gray-400 uppercase tracking-wider mt-1">Total Duels</div>
              </div>
              <div className="text-center">
                <div className="text-3xl md:text-4xl font-black text-[#d4a048]">{totalGoals}</div>
                <div className="text-xs text-gray-400 uppercase tracking-wider mt-1">Goals Struck</div>
              </div>
            </div>

            {/* Progress bar */}
            <div className="mt-12 max-w-md mx-auto">
              <div className="flex justify-between text-xs text-gray-400 mb-2">
                <span>Tournament Progress</span>
                <span>{Math.round((completedMatches / totalMatches) * 100)}%</span>
              </div>
              <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-[#d4a048] to-[#f5e6b8] rounded-full transition-all duration-500"
                  style={{ width: `${(completedMatches / totalMatches) * 100}%` }}
                />
              </div>
            </div>

            {/* Scroll indicator */}
            <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 animate-bounce">
              <div className="w-6 h-10 rounded-full border-2 border-gray-500 flex justify-center">
                <div className="w-1 h-2 bg-[#d4a048] rounded-full mt-2 animate-pulse" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* STANDINGS */}
      <section className="max-w-6xl mx-auto px-4 py-16">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-3xl md:text-4xl font-bold">⚔️ Table of Power</h2>
            <p className="text-gray-400 mt-2">Win = 3 pts • Draw = 1 pt • Loss = 0 pts</p>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <div className="w-3 h-3 bg-[#d4a048] rounded-full" />
            <span>Realm Leader</span>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm">
          <table className="w-full min-w-[800px]">
            <thead className="bg-white/10">
              <tr>
                <th className="p-4 text-left">#</th>
                <th className="p-4 text-left">Clan</th>
                <th className="p-4 text-center">P</th>
                <th className="p-4 text-center">W</th>
                <th className="p-4 text-center">D</th>
                <th className="p-4 text-center">L</th>
                <th className="p-4 text-center">GF</th>
                <th className="p-4 text-center">GA</th>
                <th className="p-4 text-center">GD</th>
                <th className="p-4 text-center">PTS</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((team, idx) => (
                <tr key={team.team} className={`border-t border-white/5 transition hover:bg-white/5 ${idx === 0 ? 'bg-[#d4a048]/5' : ''}`}>
                  <td className="p-4 font-bold">
                    {idx === 0 && <span className="text-[#d4a048] mr-1">👑</span>}
                    {idx + 1}
                  </td>
                  <td className="p-4 font-semibold">{team.team}</td>
                  <td className="p-4 text-center">{team.played}</td>
                  <td className="p-4 text-center text-green-400">{team.wins}</td>
                  <td className="p-4 text-center text-yellow-400">{team.draws}</td>
                  <td className="p-4 text-center text-red-400">{team.losses}</td>
                  <td className="p-4 text-center">{team.gf}</td>
                  <td className="p-4 text-center">{team.ga}</td>
                  <td className="p-4 text-center font-bold">{team.gd}</td>
                  <td className="p-4 text-center">
                    <span className={`inline-block px-3 py-1 rounded-lg font-bold ${idx === 0 ? 'bg-[#d4a048] text-black' : 'text-green-400'}`}>
                      {team.points}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* SCHEDULE */}
      <section className="max-w-6xl mx-auto px-4 py-16">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-3xl md:text-4xl font-bold">📅 Battle Schedule</h2>
            <p className="text-gray-400 mt-2">Each week, four clans clash for supremacy</p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {schedule.map((week) => (
            <div key={week.week} className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm p-5 hover:border-[#d4a048]/30 transition">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-[#d4a048]">Round {week.week}</h3>
                <div className="text-xs text-gray-500">Week {week.week}</div>
              </div>
              <div className="space-y-4">
                {week.games.map((game) => (
                  <div key={game.id} className="border-t border-white/10 pt-3 first:border-t-0 first:pt-0">
                    <div className="flex justify-between items-center mb-3">
                      <span className="font-semibold">{game.home}</span>
                      <span className="text-gray-500 text-sm">⚔️</span>
                      <span className="font-semibold">{game.away}</span>
                    </div>
                    
                    {game.played && editingGame !== game.id ? (
                      <div>
                        <div className="text-center text-2xl font-bold text-green-400 mb-2">
                          {game.home_score} - {game.away_score}
                        </div>
                        <button
                          onClick={() => startEdit(game.id!, game.home_score || 0, game.away_score || 0)}
                          className="w-full py-2 bg-[#d4a048]/20 rounded-lg text-sm font-semibold text-[#d4a048] hover:bg-[#d4a048]/30 transition"
                        >
                          ✏️ Edit Score
                        </button>
                      </div>
                    ) : editingGame === game.id ? (
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <input
                            type="number"
                            value={editValues[game.id!]?.home ?? game.home_score ?? 0}
                            onChange={(e) => setEditValues({
                              ...editValues,
                              [game.id!]: { 
                                home: parseInt(e.target.value) || 0, 
                                away: editValues[game.id!]?.away ?? game.away_score ?? 0 
                              }
                            })}
                            className="w-full p-2 rounded bg-black/30 border border-white/10 text-center focus:border-[#d4a048] outline-none"
                            placeholder="Home"
                          />
                          <input
                            type="number"
                            value={editValues[game.id!]?.away ?? game.away_score ?? 0}
                            onChange={(e) => setEditValues({
                              ...editValues,
                              [game.id!]: { 
                                home: editValues[game.id!]?.home ?? game.home_score ?? 0, 
                                away: parseInt(e.target.value) || 0 
                              }
                            })}
                            className="w-full p-2 rounded bg-black/30 border border-white/10 text-center focus:border-[#d4a048] outline-none"
                            placeholder="Away"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => updateScore(
                              game.id!, 
                              editValues[game.id!]?.home ?? game.home_score ?? 0,
                              editValues[game.id!]?.away ?? game.away_score ?? 0
                            )}
                            disabled={saving}
                            className="flex-1 py-2 bg-green-600 rounded-lg text-sm font-semibold hover:bg-green-500 transition"
                          >
                            {saving ? "Saving..." : "Update"}
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="flex-1 py-2 bg-gray-600 rounded-lg text-sm font-semibold hover:bg-gray-500 transition"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <input
                            type="number"
                            id={`home_${game.id}`}
                            placeholder="Home"
                            className="w-full p-2 rounded bg-black/30 border border-white/10 text-center focus:border-[#d4a048] outline-none"
                          />
                          <input
                            type="number"
                            id={`away_${game.id}`}
                            placeholder="Away"
                            className="w-full p-2 rounded bg-black/30 border border-white/10 text-center focus:border-[#d4a048] outline-none"
                          />
                        </div>
                        <button
                          onClick={() => {
                            const homeVal = (document.getElementById(`home_${game.id}`) as HTMLInputElement)?.value;
                            const awayVal = (document.getElementById(`away_${game.id}`) as HTMLInputElement)?.value;
                            saveScore(game.id!, parseInt(homeVal) || 0, parseInt(awayVal) || 0);
                          }}
                          disabled={saving}
                          className="w-full py-2 bg-[#d4a048] rounded-lg text-sm font-semibold text-black hover:bg-[#e8b84a] transition"
                        >
                          Record Result
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* FOOTER QUOTE */}
      <footer className="border-t border-white/10 py-8 text-center">
        <p className="text-gray-500 text-sm">
          "The crown does not wait for the worthy — it is taken by the brave."
        </p>
        <p className="text-gray-600 text-xs mt-2">© 2026 King of Charlotte Tournament</p>
      </footer>
    </div>
  );
}