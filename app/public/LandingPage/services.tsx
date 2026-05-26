"use client";

export default function ServicesSection() {
const services = [
{
title: "Kitchen Renovation",
image:
"https://images.unsplash.com/photo-1556911220-bff31c812dba?q=80&w=1600&auto=format&fit=crop",
},
{
title: "Bathroom Remodeling",
image:
"https://images.unsplash.com/photo-1507652313519-d4e9174996dd?q=80&w=1600&auto=format&fit=crop",
},
{
title: "Full Home Renovation",
image:
"https://images.unsplash.com/photo-1502005229762-cf1b2da7c5d6?q=80&w=1600&auto=format&fit=crop",
},
{
title: "Living Room Makeovers",
image:
"https://images.unsplash.com/photo-1493809842364-78817add7ffb?q=80&w=1600&auto=format&fit=crop",
},
{
title: "Basement Finishing",
image:
"https://images.unsplash.com/photo-1505691723518-36a5ac3be353?q=80&w=1600&auto=format&fit=crop",
},
{
title: "Flooring",
image:
"https://images.unsplash.com/photo-1584622650111-993a426fbf0a?q=80&w=1600&auto=format&fit=crop",
},
];

return (
<section className="w-full bg-[#ffeee7] py-20">
  {/* Header */}
  <div className="mx-auto mb-14 max-w-6xl px-6 text-center">
    <h2 className="text-3xl font-semibold tracking-tight text-gray-900 md:text-5xl">
      See The Transformations We've Delivered
    </h2>

    <p className="mx-auto mt-4 max-w-2xl text-gray-500">
      From full renovations to detailed interior upgrades, we turn outdated
      spaces into modern, functional, and high-value environments.
    </p>

    <a href="sms:7043034112?&body=Hi%20OSR%20Pros,%20I%20am%20ready%20to%20start%20a%20project%20and%20would%20like%20a%20quote."
      className="mt-8 inline-block rounded-full bg-orange-500 px-8 py-3 text-sm font-semibold text-white transition hover:bg-orange-600">
      Contact Us
    </a>
  </div>

  {/* Services Grid */}
  <div className="mx-auto grid max-w-7xl grid-cols-1 gap-8 px-6 md:grid-cols-2 lg:grid-cols-3">
    {services.map((service, index) => (
    <div key={index} className="group relative overflow-hidden rounded-2xl shadow-lg">
      {/* Image */}
      <div className="h-80 w-full bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
        style={{ backgroundImage: `url('${service.image}')` }} />

      {/* Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

      {/* Title */}
      <div className="absolute bottom-0 p-6">
        <h3 className="text-xl font-semibold text-white">
          {service.title}
        </h3>
      </div>
    </div>
    ))}
  </div>
</section>
);
}