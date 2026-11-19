import re

file_path = "app/page.tsx"
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update navigation items
content = content.replace(
    'const nav:{name:Page;icon:typeof Home;badge?:string}[]=[{name:"Home",icon:Home},{name:"Discover",icon:Compass},{name:"My groups",icon:Users},{name:"Opportunities",icon:BriefcaseBusiness},{name:"Messages",icon:Mail,},{name:"Notifications",icon:Bell,}];',
    'const nav:{name:Page;icon:typeof Home;badge?:string}[]=[{name:"Home",icon:Home},{name:"Discover",icon:Compass},{name:"My groups",icon:Users},{name:"Opportunities",icon:BriefcaseBusiness},{name:"Messages",icon:Mail,}];'
)

# 2. Add notification icon to top header
bell_icon_html = '<button className="icon-btn notification-top" onClick={()=>newPage("Notifications")} aria-label="Notifications"><Bell size={19}/></button>'
# In mobile view, the bell icon button is already present, I will just make sure it stays.
# Wait, the user wants me to add a bell icon specifically in the mobile header.
# It seems I need to adjust top-actions div.

# 3. Redesign mobile bottom nav
# Replace existing bottom nav with new pill-style nav
# I need a flexible way to replace that section.
# Let's find the current bottom-nav and replace it.

old_bottom_nav = '<nav className="bottom-nav">{nav.map(n=><button className={page===n.name?"active":""} key={n.name} onClick={()=>newPage(n.name)}><n.icon size={19}/><span>{n.name==="Home"?"Feed":n.name==="Opportunities"?"Careers":n.name==="Notifications"?"Alerts":n.name}</span></button>)}</nav>'
new_bottom_nav = '''
<nav className="mobile-bottom-nav">
  {nav.map(n => (
    <button 
      key={n.name} 
      className={page === n.name ? "active" : ""} 
      onClick={() => newPage(n.name)}
      aria-label={n.name}
      title={n.name}
    >
      <n.icon size={20} />
    </button>
  ))}
</nav>
'''
content = content.replace(old_bottom_nav, new_bottom_nav)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
