     export default function EstimateHeader({ pages }) {

  return (
    <div>
      {pages.map((page, index) => (
        <div key={index} className="mb-10">
          <h2 className="text-lg font-bold mb-4">
            {index === 0 ? "Estimate" : `Change Order #${index}`}
          </h2>

          {page.projects.map(project => (
            <EstimateProjectCard key={project.id} project={project} />
          ))}
        </div>
      ))}
    </div>
  );
}
